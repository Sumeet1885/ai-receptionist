-- Show the effective start after late verification, falling back to the scheduled start while pending.
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
      'plan',CASE WHEN r.plan_name IS NOT NULL THEN jsonb_build_object('name',r.plan_name,'currency',r.plan_currency,'periodEnd',r.current_period_end,'startsAt',coalesce(r.plan_started_at,r.access_starts_at)) ELSE NULL END,
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
