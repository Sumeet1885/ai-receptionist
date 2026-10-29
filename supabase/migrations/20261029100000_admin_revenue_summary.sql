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
