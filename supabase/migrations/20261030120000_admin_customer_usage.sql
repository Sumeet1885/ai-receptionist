-- Migration: Add per-customer call usage aggregation RPC
CREATE OR REPLACE FUNCTION public.admin_customer_usage(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH user_bots AS (
    SELECT id, business_name, dograh_outbound_workflow_id
    FROM public.bots WHERE owner_id = p_user
  ), calls AS (
    SELECT c.id, c.duration_seconds, c.cost_info, c.dograh_workflow_id,
      (c.cost_info->>'direction' = 'outbound' OR (c.dograh_workflow_id IS NOT NULL AND c.dograh_workflow_id IN (SELECT dograh_outbound_workflow_id FROM user_bots WHERE dograh_outbound_workflow_id IS NOT NULL))) AS is_outbound
    FROM public.phone_calls c
    WHERE c.bot_id IN (SELECT id FROM user_bots)
  )
  SELECT jsonb_build_object(
    'inboundCalls', coalesce(count(*) FILTER (WHERE NOT is_outbound), 0),
    'inboundSeconds', coalesce(sum(duration_seconds) FILTER (WHERE NOT is_outbound), 0),
    'outboundCalls', coalesce(count(*) FILTER (WHERE is_outbound), 0),
    'outboundSeconds', coalesce(sum(duration_seconds) FILTER (WHERE is_outbound), 0),
    'totalCalls', coalesce(count(*), 0),
    'totalSeconds', coalesce(sum(duration_seconds), 0)
  ) FROM calls;
$$;

REVOKE ALL ON FUNCTION public.admin_customer_usage(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_usage(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

