-- ==============================================================================
-- BOLEGA INDIA: COMBINED SENIOR PR #30 MIGRATIONS
-- Database: Supabase project xdwcrsydlzprtldkwqzh
-- Run this in Supabase Web Dashboard -> SQL Editor (or via supabase db push)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Migration: supabase/migrations/20261027190000_support_tickets.sql
-- ------------------------------------------------------------------------------
-- Support data is API-only. The service role enforces ticket ownership and admin permissions.
CREATE TABLE public.support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  categories jsonb NOT NULL DEFAULT '[]',
  retention_days integer NOT NULL DEFAULT 0 CHECK (retention_days BETWEEN 0 AND 3650)
);
INSERT INTO public.support_settings (id) VALUES (true);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 254),
  email text NOT NULL CHECK (length(email) <= 254),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 25),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 150),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 50),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting_reply','resolved','closed')),
  assigned_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_unread boolean NOT NULL DEFAULT true,
  guest_token_hash text UNIQUE,
  guest_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id, updated_at DESC);
CREATE INDEX support_tickets_triage_idx ON public.support_tickets(status, updated_at DESC);
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer','admin')),
  sender_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_internal OR sender_type = 'admin')
);
CREATE INDEX support_messages_ticket_idx ON public.support_messages(ticket_id, created_at);
CREATE TABLE public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 10485760)
);
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_settings, public.support_tickets, public.support_messages, public.support_attachments FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.support_tickets_ticket_number_seq FROM anon, authenticated;
GRANT ALL ON public.support_settings, public.support_tickets, public.support_messages, public.support_attachments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-attachments','support-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Ticket + first message + attachment records commit together after private uploads succeed.
CREATE FUNCTION public.create_support_ticket(p_ticket jsonb, p_body text, p_files jsonb DEFAULT '[]')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ticket_id uuid; message_id uuid;
BEGIN
  INSERT INTO support_tickets(user_id,name,email,phone,subject,category,priority,guest_token_hash,guest_expires_at)
  VALUES ((p_ticket->>'user_id')::uuid,p_ticket->>'name',p_ticket->>'email',coalesce(p_ticket->>'phone',''),p_ticket->>'subject',p_ticket->>'category',p_ticket->>'priority',p_ticket->>'guest_token_hash',(p_ticket->>'guest_expires_at')::timestamptz)
  RETURNING id INTO ticket_id;
  INSERT INTO support_messages(ticket_id,sender_type,sender_name,body) VALUES(ticket_id,'customer',p_ticket->>'name',p_body) RETURNING id INTO message_id;
  INSERT INTO support_attachments(message_id,storage_key,file_name,content_type,file_size)
  SELECT message_id,f->>'storage_key',f->>'file_name',f->>'content_type',(f->>'file_size')::integer FROM jsonb_array_elements(p_files) f;
  RETURN ticket_id;
END $$;
CREATE FUNCTION public.reply_support_ticket(p_id uuid, p_body text, p_sender text, p_name text, p_internal boolean, p_files jsonb DEFAULT '[]')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE message_id uuid;
BEGIN
  PERFORM id FROM support_tickets WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  INSERT INTO support_messages(ticket_id,sender_type,sender_name,body,is_internal)
  VALUES(p_id,p_sender,p_name,p_body,p_internal) RETURNING id INTO message_id;
  INSERT INTO support_attachments(message_id,storage_key,file_name,content_type,file_size)
  SELECT message_id,f->>'storage_key',f->>'file_name',f->>'content_type',(f->>'file_size')::integer FROM jsonb_array_elements(p_files) f;
  UPDATE support_tickets SET updated_at=now(),admin_unread=(p_sender='customer' OR admin_unread),
    status=CASE WHEN p_internal THEN status WHEN p_sender='admin' THEN 'awaiting_reply' WHEN status='in_progress' THEN status ELSE 'open' END WHERE id=p_id;
  RETURN message_id;
END $$;
REVOKE ALL ON FUNCTION public.create_support_ticket(jsonb,text,jsonb), public.reply_support_ticket(uuid,text,text,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(jsonb,text,jsonb), public.reply_support_ticket(uuid,text,text,text,boolean,jsonb) TO service_role;

-- Durable cleanup queue: a storage outage must not leave untracked attachment objects.
CREATE TABLE public.support_storage_cleanup (
  storage_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_storage_cleanup FROM anon, authenticated;
GRANT ALL ON public.support_storage_cleanup TO service_role;
CREATE FUNCTION public.purge_finished_support(p_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ticket record; deleted_count integer := 0;
BEGIN
  FOR ticket IN SELECT id FROM support_tickets WHERE status IN ('resolved','closed') AND updated_at < p_cutoff LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO support_storage_cleanup(storage_key)
    SELECT a.storage_key FROM support_attachments a JOIN support_messages m ON m.id=a.message_id WHERE m.ticket_id=ticket.id
    ON CONFLICT DO NOTHING;
    DELETE FROM support_tickets WHERE id=ticket.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_finished_support(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_finished_support(timestamptz) TO service_role;


-- ------------------------------------------------------------------------------
-- Migration: supabase/migrations/20261029090000_workspace_minute_purchases.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- Migration: supabase/migrations/20261029100000_admin_revenue_summary.sql
-- ------------------------------------------------------------------------------
-- Aggregate in PostgreSQL; never transfer or truncate the underlying order lists.
CREATE FUNCTION public.admin_revenue_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH paid AS NOT MATERIALIZED (
  SELECT total,currency,paid_at,purchase_kind,coalesce(plan_snapshot->>'name','Unknown plan') AS plan
  FROM billing_orders WHERE status IN ('paid','provisioned','review') AND paid_at IS NOT NULL
), bounds AS (
  SELECT now()-interval '30 days' AS recent,
    date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AS month_start
), sums AS (
  SELECT
    coalesce(sum(total) FILTER(WHERE currency='INR'),0) AS all_inr,
    coalesce(sum(total) FILTER(WHERE currency='USD'),0) AS all_usd,
    coalesce(sum(total) FILTER(WHERE currency='INR' AND paid_at>=month_start),0) AS month_inr,
    coalesce(sum(total) FILTER(WHERE currency='USD' AND paid_at>=month_start),0) AS month_usd,
    coalesce(sum(total) FILTER(WHERE currency='INR' AND paid_at>=recent),0) AS recent_inr,
    coalesce(sum(total) FILTER(WHERE currency='USD' AND paid_at>=recent),0) AS recent_usd,
    count(*) AS all_count,count(*) FILTER(WHERE paid_at>=month_start) AS month_count,
    count(*) FILTER(WHERE paid_at>=recent) AS recent_count,
    count(*) FILTER(WHERE paid_at>=recent AND purchase_kind='initial') AS signups
  FROM paid CROSS JOIN bounds
), month_series AS (
  SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-interval '5 months',
    date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata'),interval '1 month') AS month
), monthly AS (
  SELECT to_char(m.month,'YYYY-MM') AS month,
    coalesce(sum(p.total) FILTER(WHERE p.currency='INR'),0) AS inr,
    coalesce(sum(p.total) FILTER(WHERE p.currency='USD'),0) AS usd,count(p.total) AS count
  FROM month_series m LEFT JOIN paid p ON p.paid_at>=m.month AT TIME ZONE 'Asia/Kolkata'
    AND p.paid_at<(m.month+interval '1 month') AT TIME ZONE 'Asia/Kolkata'
  GROUP BY m.month
), plans AS (
  SELECT plan,count(*) AS count,
    coalesce(sum(total) FILTER(WHERE currency='INR'),0) AS inr,
    coalesce(sum(total) FILTER(WHERE currency='USD'),0) AS usd
  FROM paid GROUP BY plan ORDER BY count DESC,plan LIMIT 20
), leads AS (
  SELECT count(*) AS open,
    count(*) FILTER(WHERE checkout_dismissed_at IS NOT NULL AND payment_error IS NULL) AS closed,
    count(*) FILTER(WHERE payment_error IS NOT NULL) AS failed,
    count(*) FILTER(WHERE created_at>=recent) AS recent_count
  FROM billing_orders CROSS JOIN bounds WHERE status='created' AND customer_user_id IS NULL
)
SELECT jsonb_build_object(
  'totals',jsonb_build_object('allTime',jsonb_build_object('INR',all_inr,'USD',all_usd),
    'thisMonth',jsonb_build_object('INR',month_inr,'USD',month_usd),
    'last30Days',jsonb_build_object('INR',recent_inr,'USD',recent_usd)),
  'counts',jsonb_build_object('allTime',all_count,'thisMonth',month_count,'last30Days',s.recent_count),
  'monthly',(SELECT jsonb_agg(jsonb_build_object('month',month,'INR',inr,'USD',usd,'count',count) ORDER BY month) FROM monthly),
  'byPlan',coalesce((SELECT jsonb_agg(jsonb_build_object('plan',plan,'count',count,'INR',inr,'USD',usd) ORDER BY count DESC,plan) FROM plans),'[]'::jsonb),
  'leads',jsonb_build_object('open',l.open,'closed',l.closed,'failed',l.failed,'last30Days',l.recent_count),
  'conversionLast30Days',CASE WHEN signups+l.recent_count>0 THEN round(signups*100.0/(signups+l.recent_count),1) ELSE NULL END
) FROM sums s CROSS JOIN leads l;
$$;
REVOKE ALL ON FUNCTION public.admin_revenue_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO service_role;
NOTIFY pgrst,'reload schema';


-- ------------------------------------------------------------------------------
-- Migration: supabase/migrations/20261029110000_seed_usd_minute_topups.sql
-- ------------------------------------------------------------------------------
-- Editable catalogue defaults, in major currency units (USD, not cents).
-- Preserve prices and pack sizes already configured by an administrator.
INSERT INTO public.plan_features (key, label, sort_order)
VALUES ('topup_500_minutes_usd', 'Top-up: 500 minutes (USD)', 41)
ON CONFLICT (key) DO NOTHING;

UPDATE public.plans AS p
SET feature_values = COALESCE(p.feature_values, '{}'::jsonb)
  || CASE WHEN NULLIF(BTRIM(p.feature_values->>'topup_500_minutes_usd'), '') IS NULL
       THEN jsonb_build_object('topup_500_minutes_usd', defaults.usd_price)
       ELSE '{}'::jsonb END
  || CASE WHEN NULLIF(BTRIM(p.feature_values->>'topup_minutes'), '') IS NULL
       THEN jsonb_build_object('topup_minutes', '500')
       ELSE '{}'::jsonb END
FROM (VALUES
  ('ai-starter', '50'),
  ('ai-growth', '45'),
  ('ai-business-pro', '40')
) AS defaults(slug, usd_price)
WHERE p.slug = defaults.slug
  AND NOT p.is_trial
  AND NOT p.contact_sales;

NOTIFY pgrst, 'reload schema';


COMMIT;
