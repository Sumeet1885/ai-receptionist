-- All access deadlines are exclusive at midnight IST (access includes 23:59 on the expiry date).
CREATE FUNCTION public.workspace_period_end(p_start timestamptz, p_days integer DEFAULT 0, p_months integer DEFAULT 0, p_end_date date DEFAULT NULL)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN p_start IS NULL THEN NULL ELSE
    ((coalesce(p_end_date, ((p_start AT TIME ZONE 'Asia/Kolkata')::date + make_interval(months=>p_months,days=>p_days))::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') END;
$$;
REVOKE ALL ON FUNCTION public.workspace_period_end(timestamptz,integer,integer,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_period_end(timestamptz,integer,integer,date) TO service_role;

ALTER TABLE public.customer_accounts ADD COLUMN access_months integer CHECK(access_months BETWEEN 1 AND 12);
ALTER TABLE public.customer_accounts ADD COLUMN access_end_date date;
ALTER TABLE public.customer_accounts ADD COLUMN access_starts_at timestamptz;
ALTER TABLE public.access_requests ADD COLUMN assigned_expiry_date date;
ALTER TABLE public.access_requests ADD COLUMN assigned_start_date date;

CREATE OR REPLACE FUNCTION public.activate_workspace_trial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ends timestamptz;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE customer_accounts SET
      trial_started_at=CASE WHEN trial_days IS NOT NULL THEN greatest(NEW.email_confirmed_at,access_starts_at) ELSE NULL END,
      trial_ends_at=CASE WHEN trial_days IS NOT NULL THEN workspace_period_end(greatest(NEW.email_confirmed_at,access_starts_at),trial_days,0,access_end_date) ELSE NULL END,
      access_expires_at=workspace_period_end(greatest(NEW.email_confirmed_at,access_starts_at),coalesce(trial_days,0),coalesce(access_months,0),access_end_date),
      plan_started_at=greatest(NEW.email_confirmed_at,access_starts_at),
      current_period_end=workspace_period_end(greatest(NEW.email_confirmed_at,access_starts_at),coalesce(trial_days,0),coalesce(access_months,0),access_end_date),updated_at=now()
    WHERE user_id=NEW.id AND (trial_days IS NOT NULL OR access_months IS NOT NULL) AND plan_started_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.assign_workspace_plan(p_user uuid,p_plan uuid,p_request uuid DEFAULT NULL,p_end_date date DEFAULT NULL,p_start_date date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE chosen plans%ROWTYPE; confirmed timestamptz; existing customer_accounts%ROWTYPE; ends timestamptz; starts timestamptz;
BEGIN
  SELECT * INTO chosen FROM plans WHERE id=p_plan AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active plan'; END IF;
  IF p_end_date IS NOT NULL AND (p_end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date OR p_end_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + interval '5 years') THEN
    RAISE EXCEPTION 'Choose an expiry date from today to five years ahead';
  END IF;
  IF p_start_date IS NOT NULL AND (p_start_date < (now() AT TIME ZONE 'Asia/Kolkata')::date OR p_start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + interval '5 years') THEN RAISE EXCEPTION 'Choose a valid start date'; END IF;
  IF p_end_date IS NOT NULL AND p_start_date IS NOT NULL AND p_end_date < p_start_date THEN RAISE EXCEPTION 'Expiry must be on or after the start date'; END IF;
  IF chosen.is_trial AND p_end_date IS NOT NULL THEN RAISE EXCEPTION 'Trial duration is configured on the trial plan'; END IF;
  SELECT email_confirmed_at INTO confirmed FROM auth.users WHERE id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer login not found'; END IF;
  INSERT INTO customer_accounts(user_id,access_request_id) VALUES(p_user,p_request) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO existing FROM customer_accounts WHERE user_id=p_user FOR UPDATE;
  -- Retries must neither extend nor replace a grant, and must never replace a captured payment.
  IF existing.plan_id=p_plan AND existing.billing_order_id IS NULL AND (existing.trial_days IS NOT NULL OR existing.access_months IS NOT NULL) AND existing.access_end_date IS NOT DISTINCT FROM p_end_date AND existing.access_starts_at IS NOT DISTINCT FROM ((p_start_date::timestamp + interval '1 minute') AT TIME ZONE 'Asia/Kolkata') THEN RETURN; END IF;
  IF existing.plan_id IS NOT NULL OR existing.billing_order_id IS NOT NULL THEN RAISE EXCEPTION 'Workspace already has an assigned plan'; END IF;
  starts := CASE WHEN confirmed IS NOT NULL THEN greatest(confirmed,((p_start_date::timestamp + interval '1 minute') AT TIME ZONE 'Asia/Kolkata')) ELSE NULL END;
  ends := workspace_period_end(starts,CASE WHEN chosen.is_trial THEN chosen.trial_days ELSE 0 END,CASE WHEN chosen.is_trial THEN 0 ELSE 1 END,p_end_date);
  UPDATE customer_accounts SET plan_id=chosen.id,trial_days=CASE WHEN chosen.is_trial THEN chosen.trial_days ELSE NULL END,
    access_months=CASE WHEN chosen.is_trial THEN NULL ELSE 1 END,access_end_date=p_end_date,access_starts_at=((p_start_date::timestamp + interval '1 minute') AT TIME ZONE 'Asia/Kolkata'),
    trial_started_at=CASE WHEN chosen.is_trial THEN starts ELSE NULL END,
    trial_ends_at=CASE WHEN chosen.is_trial THEN ends ELSE NULL END,
    access_expires_at=ends,plan_started_at=starts,current_period_end=ends,updated_at=now()
  WHERE user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.assign_workspace_plan(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_workspace_plan(uuid,uuid,uuid,date,date) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_workspace_trial(p_user uuid,p_plan uuid,p_request uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM plans WHERE id=p_plan AND is_trial AND is_active) THEN RAISE EXCEPTION 'Choose an active trial plan'; END IF;
  PERFORM assign_workspace_plan(p_user,p_plan,p_request,NULL,NULL);
END $$;

CREATE OR REPLACE FUNCTION public.workspace_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM customer_accounts WHERE user_id=auth.uid()
    AND status='active' AND (trial_days IS NULL OR trial_started_at IS NOT NULL)
    AND (access_months IS NULL OR plan_started_at IS NOT NULL)
    AND (access_starts_at IS NULL OR access_starts_at <= now())
    AND (access_expires_at IS NULL OR access_expires_at > now()));
$$;

CREATE OR REPLACE FUNCTION public.activate_workspace_payment(p_order uuid) RETURNS boolean
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
    plan_started_at=started,current_period_end=workspace_period_end(started,0,1),access_expires_at=workspace_period_end(started,0,1),
    trial_days=NULL,trial_started_at=NULL,trial_ends_at=NULL,access_months=NULL,access_end_date=NULL,access_starts_at=NULL,billing_order_id=paid.id,updated_at=now()
  WHERE user_id=paid.customer_user_id;
  UPDATE billing_orders SET status='provisioned',provisioned_user_id=paid.customer_user_id,provisioned_at=now(),password_hash=NULL,updated_at=now() WHERE id=paid.id;
  RETURN true;
END $$;

-- Preserve each existing expiry's IST date while extending timed deadlines through that day's end.
UPDATE customer_accounts SET
  access_expires_at=CASE WHEN (access_expires_at AT TIME ZONE 'Asia/Kolkata')::time='00:00' THEN access_expires_at ELSE workspace_period_end(access_expires_at) END,
  trial_ends_at=CASE WHEN (trial_ends_at AT TIME ZONE 'Asia/Kolkata')::time='00:00' THEN trial_ends_at ELSE workspace_period_end(trial_ends_at) END,
  current_period_end=CASE WHEN (current_period_end AT TIME ZONE 'Asia/Kolkata')::time='00:00' THEN current_period_end ELSE workspace_period_end(current_period_end) END
WHERE access_expires_at IS NOT NULL OR trial_ends_at IS NOT NULL OR current_period_end IS NOT NULL;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.admin_customer_page(
  p_page integer DEFAULT 1, p_size integer DEFAULT 25,
  p_stage text DEFAULT NULL, p_search text DEFAULT '', p_user uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH base AS MATERIALIZED (
    SELECT a.*, u.email, u.raw_user_meta_data->>'full_name' AS full_name,
      u.raw_user_meta_data->>'business_name' AS business_name,
      u.email_confirmed_at, u.last_sign_in_at, p.name AS plan_name,
      CASE WHEN a.status='suspended' THEN 'suspended'
        WHEN u.email_confirmed_at IS NULL THEN 'verify_email'
        WHEN a.password_set_at IS NULL THEN 'set_password'
        WHEN a.access_expires_at<=now() THEN 'payment_required'
        WHEN a.access_starts_at>now() THEN 'scheduled'
        WHEN a.onboarding_completed_at IS NULL THEN 'onboarding'
        ELSE 'active' END AS stage
    FROM public.customer_accounts a JOIN auth.users u ON u.id=a.user_id
    LEFT JOIN public.plans p ON p.id=a.plan_id
    WHERE p_user IS NULL OR a.user_id=p_user
  ), filtered AS MATERIALIZED (
    SELECT * FROM base WHERE (p_stage IS NULL OR stage=p_stage)
      AND (coalesce(p_search,'')='' OR strpos(lower(coalesce(email,'')),lower(p_search))>0
        OR strpos(lower(coalesce(full_name,'')),lower(p_search))>0
        OR strpos(lower(coalesce(business_name,'')),lower(p_search))>0)
  ), paged AS (
    SELECT * FROM filtered ORDER BY created_at DESC,user_id DESC
    LIMIT greatest(1,least(coalesce(p_size,25),25))
    OFFSET (greatest(1,least(coalesce(p_page,1),100000))-1)*greatest(1,least(coalesce(p_size,25),25))
  )
  SELECT jsonb_build_object(
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'userId',r.user_id,'email',r.email,'name',r.full_name,'businessName',r.business_name,
      'status',r.status,'stage',r.stage,
      'source',CASE WHEN r.billing_order_id IS NOT NULL THEN 'paid' WHEN r.access_request_id IS NOT NULL THEN 'access_request' ELSE 'existing' END,
      'plan',CASE WHEN r.plan_name IS NOT NULL THEN jsonb_build_object('name',r.plan_name,'currency',r.plan_currency,'periodEnd',r.current_period_end,'startsAt',coalesce(r.access_starts_at,r.plan_started_at)) ELSE NULL END,
      'agents',(SELECT count(*) FROM public.bots b WHERE b.owner_id=r.user_id),
      'createdAt',r.created_at,'emailConfirmedAt',r.email_confirmed_at,'lastSignInAt',r.last_sign_in_at
    ) ORDER BY r.created_at DESC,r.user_id DESC) FROM paged r),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'counts',(SELECT jsonb_build_object('all',count(*),
      'verify_email',count(*) FILTER(WHERE stage='verify_email'),
      'set_password',count(*) FILTER(WHERE stage='set_password'),
      'onboarding',count(*) FILTER(WHERE stage='onboarding'),
      'scheduled',count(*) FILTER(WHERE stage='scheduled'),
      'active',count(*) FILTER(WHERE stage='active'),
      'suspended',count(*) FILTER(WHERE stage='suspended'),
      'payment_required',count(*) FILTER(WHERE stage='payment_required')) FROM base)
  );
$$;
REVOKE ALL ON FUNCTION public.admin_customer_page(integer,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_page(integer,integer,text,text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
