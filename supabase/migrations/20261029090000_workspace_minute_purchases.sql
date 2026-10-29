-- Server-owned purchase types, period-bound credits and usage. No browser balance writes.
ALTER TABLE public.billing_orders
  ADD COLUMN purchase_kind text NOT NULL DEFAULT 'initial' CHECK (purchase_kind IN ('initial','renewal','plan_change','topup')),
  ADD COLUMN minutes_added integer CHECK (minutes_added > 0),
  ADD COLUMN target_period_start timestamptz,
  ADD COLUMN target_period_end timestamptz;
ALTER TABLE public.customer_accounts ADD COLUMN call_minutes_quota integer CHECK (call_minutes_quota >= 0);
UPDATE public.customer_accounts a SET call_minutes_quota=p.monthly_minutes FROM public.plans p WHERE p.id=a.plan_id;

CREATE TABLE public.workspace_minute_credits (
  order_id uuid PRIMARY KEY REFERENCES public.billing_orders(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  minutes integer NOT NULL CHECK(minutes>0),
  period_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_minute_credits_owner ON public.workspace_minute_credits(user_id,period_start,expires_at);
ALTER TABLE public.workspace_minute_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_minute_credits FROM anon,authenticated;

-- Independent of transcript retention. Mirroring the same call twice never bills it twice.
CREATE TABLE public.workspace_call_usage (
  call_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL,
  billed_seconds bigint NOT NULL CHECK(billed_seconds>=0)
);
CREATE INDEX workspace_call_usage_period ON public.workspace_call_usage(user_id,started_at);
ALTER TABLE public.workspace_call_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_call_usage FROM anon,authenticated;

CREATE FUNCTION public.call_billed_seconds(duration integer) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(duration,0)<=0 THEN 0 WHEN duration<25 THEN 30 ELSE ceil(duration::numeric/60)::bigint*60 END;
$$;
CREATE FUNCTION public.record_workspace_call_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO workspace_call_usage(call_id,user_id,started_at,billed_seconds)
    SELECT NEW.id,b.owner_id,coalesce(NEW.started_at,NEW.created_at),call_billed_seconds(NEW.duration_seconds)
    FROM bots b WHERE b.id=NEW.bot_id
  ON CONFLICT(call_id) DO UPDATE SET billed_seconds=EXCLUDED.billed_seconds,
    started_at=coalesce(NEW.started_at,workspace_call_usage.started_at);
  RETURN NEW;
END $$;
CREATE TRIGGER workspace_call_usage_update AFTER INSERT OR UPDATE OF duration_seconds,started_at ON public.phone_calls
FOR EACH ROW EXECUTE FUNCTION public.record_workspace_call_usage();
INSERT INTO public.workspace_call_usage(call_id,user_id,started_at,billed_seconds)
  SELECT c.id,b.owner_id,coalesce(c.started_at,c.created_at),public.call_billed_seconds(c.duration_seconds)
  FROM public.phone_calls c JOIN public.bots b ON b.id=c.bot_id;

CREATE FUNCTION public.snapshot_workspace_minutes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.plan_started_at IS DISTINCT FROM OLD.plan_started_at OR NEW.billing_order_id IS DISTINCT FROM OLD.billing_order_id THEN
    IF NEW.billing_order_id IS NOT NULL THEN
      SELECT (plan_snapshot->>'monthly_minutes')::integer INTO NEW.call_minutes_quota FROM billing_orders WHERE id=NEW.billing_order_id;
    ELSE
      SELECT monthly_minutes INTO NEW.call_minutes_quota FROM plans WHERE id=NEW.plan_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER snapshot_workspace_minutes BEFORE INSERT OR UPDATE OF plan_id,plan_started_at,billing_order_id ON public.customer_accounts
FOR EACH ROW EXECUTE FUNCTION public.snapshot_workspace_minutes();

CREATE FUNCTION public.workspace_minute_summary(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH account AS (
    SELECT a.*,p.name,p.slug,p.is_trial,p.feature_values,
      (a.status='active' AND a.plan_started_at<=now() AND a.access_expires_at>now()) AS available
    FROM customer_accounts a LEFT JOIN plans p ON p.id=a.plan_id WHERE a.user_id=p_user
  ), totals AS (
    SELECT a.*,
      coalesce((SELECT sum(c.billed_seconds) FROM workspace_call_usage c WHERE c.user_id=p_user
        AND c.started_at>=a.plan_started_at AND c.started_at<a.access_expires_at),0)/60.0 AS used,
      coalesce((SELECT sum(c.minutes) FROM workspace_minute_credits c WHERE c.user_id=p_user
        AND c.period_start=a.plan_started_at AND c.expires_at>now()),0) AS extra
    FROM account a
  ) SELECT jsonb_build_object('planId',plan_id,'planName',name,'planSlug',slug,'currency',coalesce(plan_currency,'INR'),
    'isTrial',coalesce(is_trial,false),'startsAt',plan_started_at,'expiresAt',access_expires_at,
    'includedMinutes',call_minutes_quota,'topupMinutes',extra,'usedMinutes',used,
    'remainingMinutes',CASE WHEN NOT coalesce(available,false) THEN 0 WHEN call_minutes_quota IS NULL AND plan_id IS NOT NULL THEN NULL ELSE greatest(0,coalesce(call_minutes_quota,0)+extra-used) END,
    'active',coalesce(available,false),'features',coalesce(feature_values,'{}'::jsonb)) FROM totals;
$$;

-- Preserve the existing activation implementation for regular renewals/plan changes.
ALTER FUNCTION public.activate_workspace_payment(uuid) RENAME TO activate_workspace_plan_payment;
CREATE FUNCTION public.activate_workspace_payment(p_order uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid billing_orders%ROWTYPE; account customer_accounts%ROWTYPE;
BEGIN
  SELECT * INTO paid FROM billing_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR paid.customer_user_id IS NULL OR paid.status NOT IN ('paid','provisioned') THEN RETURN false; END IF;
  IF paid.status='provisioned' THEN RETURN true; END IF;
  SELECT * INTO account FROM customer_accounts WHERE user_id=paid.customer_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF paid.purchase_kind<>'topup' THEN
    IF (paid.target_period_start IS NOT NULL AND account.plan_started_at IS DISTINCT FROM paid.target_period_start)
      OR account.plan_started_at>paid.created_at THEN
      UPDATE billing_orders SET status='review',failure_reason='Workspace plan changed while payment was pending; refund or review required',updated_at=now() WHERE id=p_order;
      RETURN true;
    END IF;
    RETURN activate_workspace_plan_payment(p_order);
  END IF;
  -- Payment for an old/changed/expired period is retained for refund/manual review, never lost or credited to a new period.
  IF account.status<>'active' OR account.plan_started_at IS DISTINCT FROM paid.target_period_start
    OR account.access_expires_at IS DISTINCT FROM paid.target_period_end OR account.access_expires_at<=now() THEN
    UPDATE billing_orders SET status='review',failure_reason='Top-up paid after its plan period expired or changed; refund or review required',updated_at=now() WHERE id=p_order;
    RETURN true;
  END IF;
  IF paid.minutes_added IS NULL THEN RAISE EXCEPTION 'Missing top-up minutes'; END IF;
  INSERT INTO workspace_minute_credits(order_id,user_id,minutes,period_start,expires_at)
    VALUES(paid.id,paid.customer_user_id,paid.minutes_added,paid.target_period_start,paid.target_period_end)
    ON CONFLICT(order_id) DO NOTHING;
  UPDATE billing_orders SET status='provisioned',provisioned_user_id=paid.customer_user_id,provisioned_at=now(),updated_at=now() WHERE id=p_order;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.workspace_minute_summary(uuid),public.record_workspace_call_usage(),public.snapshot_workspace_minutes(),public.call_billed_seconds(integer),public.activate_workspace_payment(uuid),public.activate_workspace_plan_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_minute_summary(uuid),public.activate_workspace_payment(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
