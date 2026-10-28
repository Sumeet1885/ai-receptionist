ALTER TABLE public.plans ADD COLUMN is_trial boolean NOT NULL DEFAULT false;
ALTER TABLE public.plans ADD COLUMN trial_days integer;
ALTER TABLE public.plans ADD CONSTRAINT plans_trial_duration CHECK (
  (is_trial AND trial_days IS NOT NULL AND trial_days BETWEEN 1 AND 365 AND NOT contact_sales)
  OR (NOT is_trial AND trial_days IS NULL)
);
INSERT INTO public.plans(slug,name,tagline,sort_order,is_trial,trial_days,monthly_minutes,max_agents,max_concurrent_calls)
VALUES('trial-period','Trial Period','Private trial assigned by the support team',0,true,14,100,1,1)
ON CONFLICT(slug) DO NOTHING;

ALTER TABLE public.customer_accounts ADD COLUMN trial_days integer CHECK(trial_days BETWEEN 1 AND 365);
ALTER TABLE public.customer_accounts ADD COLUMN trial_started_at timestamptz;
ALTER TABLE public.customer_accounts ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE public.customer_accounts ADD COLUMN access_expires_at timestamptz;
ALTER TABLE public.billing_orders ADD COLUMN customer_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.access_requests ADD COLUMN trial_plan_id uuid REFERENCES public.plans(id) ON DELETE RESTRICT;

-- The duration is snapshotted on approval; only verified email starts its clock.
CREATE FUNCTION public.activate_workspace_trial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE customer_accounts SET trial_started_at=NEW.email_confirmed_at,
      trial_ends_at=NEW.email_confirmed_at + make_interval(days=>trial_days),
      access_expires_at=NEW.email_confirmed_at + make_interval(days=>trial_days),
      plan_started_at=NEW.email_confirmed_at,
      current_period_end=NEW.email_confirmed_at + make_interval(days=>trial_days)
    WHERE user_id=NEW.id AND trial_days IS NOT NULL AND trial_started_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER start_customer_trial AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.activate_workspace_trial();
REVOKE ALL ON FUNCTION public.activate_workspace_trial() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.assign_workspace_trial(p_user uuid,p_plan uuid,p_request uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE chosen plans%ROWTYPE; confirmed timestamptz;
BEGIN
  SELECT * INTO chosen FROM plans WHERE id=p_plan AND is_trial AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active trial plan'; END IF;
  SELECT email_confirmed_at INTO confirmed FROM auth.users WHERE id=p_user;
  INSERT INTO customer_accounts(user_id,access_request_id) VALUES(p_user,p_request) ON CONFLICT(user_id) DO NOTHING;
  PERFORM user_id FROM customer_accounts WHERE user_id=p_user FOR UPDATE;
  IF EXISTS(SELECT 1 FROM customer_accounts WHERE user_id=p_user AND trial_days IS NOT NULL) THEN RETURN; END IF;
  UPDATE customer_accounts SET plan_id=chosen.id,trial_days=chosen.trial_days,
    trial_started_at=confirmed, trial_ends_at=confirmed+make_interval(days=>chosen.trial_days),
    access_expires_at=confirmed+make_interval(days=>chosen.trial_days),
    plan_started_at=confirmed,current_period_end=confirmed+make_interval(days=>chosen.trial_days),updated_at=now()
  WHERE user_id=p_user AND billing_order_id IS NULL AND trial_days IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace already has an assigned plan'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assign_workspace_trial(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_workspace_trial(uuid,uuid,uuid) TO service_role;

-- Direct Supabase browser queries must obey the same expiry as the API.
CREATE FUNCTION public.workspace_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM customer_accounts WHERE user_id=auth.uid()
    AND status='active' AND (trial_days IS NULL OR trial_started_at IS NOT NULL)
    AND (access_expires_at IS NULL OR access_expires_at > now()));
$$;
REVOKE ALL ON FUNCTION public.workspace_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_access_allowed() TO authenticated;
DO $$ DECLARE target record; BEGIN
  FOR target IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND c.relname NOT IN ('customer_accounts','plans','plan_features','coupons','billing_orders')
  LOOP
    EXECUTE format('CREATE POLICY workspace_subscription_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.workspace_access_allowed()) WITH CHECK (public.workspace_access_allowed())',target.relname);
  END LOOP;
END $$;

-- Captured payments activate the existing workspace atomically and can be replayed safely.
CREATE FUNCTION public.activate_workspace_payment(p_order uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid billing_orders%ROWTYPE; started timestamptz;
BEGIN
  SELECT * INTO paid FROM billing_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR paid.customer_user_id IS NULL OR paid.status NOT IN ('paid','provisioned') THEN RETURN false; END IF;
  IF paid.status='provisioned' THEN RETURN true; END IF;
  PERFORM user_id FROM customer_accounts WHERE user_id=paid.customer_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  started := coalesce(paid.paid_at,now());
  UPDATE customer_accounts SET plan_id=paid.plan_id,plan_currency=paid.currency,
    plan_started_at=started,current_period_end=started+interval '1 month',access_expires_at=started+interval '1 month',
    trial_days=NULL,trial_started_at=NULL,trial_ends_at=NULL,billing_order_id=paid.id,updated_at=now()
  WHERE user_id=paid.customer_user_id;
  UPDATE billing_orders SET status='provisioned',provisioned_user_id=paid.customer_user_id,provisioned_at=now(),password_hash=NULL,updated_at=now() WHERE id=paid.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.activate_workspace_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_workspace_payment(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
