-- Paid signup: the customer chooses a password before paying, and every checkout attempt is kept
-- as a lead, including ones closed or failed in Razorpay, so the team can follow up.

-- bcrypt hash of the password chosen at checkout. The login is created from it only after the
-- payment is captured (Supabase accepts the hash directly), then it is cleared.
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- When the person closed the confirmation or the Razorpay window without paying.
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS checkout_dismissed_at TIMESTAMPTZ;
-- Last error Razorpay reported for a payment attempt (card declined and so on).
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS payment_error TEXT;

NOTIFY pgrst, 'reload schema';
