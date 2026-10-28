ALTER TABLE public.admin_notification_recipients ADD COLUMN notify_sales boolean NOT NULL DEFAULT false;
ALTER TABLE public.admin_notification_recipients ADD COLUMN notify_support boolean NOT NULL DEFAULT false;
-- Preserve the support alert recipients that previously always received support notifications.
INSERT INTO public.admin_notification_recipients(email,label,notify_access_requests,notify_payments,notify_signup_leads,notify_support,notify_sales)
SELECT DISTINCT u.email,'Support and sales alerts',
  NOT EXISTS(SELECT 1 FROM public.admin_notification_recipients),
  NOT EXISTS(SELECT 1 FROM public.admin_notification_recipients),
  NOT EXISTS(SELECT 1 FROM public.admin_notification_recipients),true,true
FROM public.admin_users u JOIN public.admin_role_assignments r ON r.admin_user_id=u.id
WHERE u.status='active' AND r.role='super_admin' AND r.revoked_at IS NULL
ON CONFLICT(email) DO UPDATE SET notify_support=true,notify_sales=true;
NOTIFY pgrst, 'reload schema';
