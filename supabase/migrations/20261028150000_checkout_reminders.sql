-- Payment reminder for checkouts that were not paid: due 30 minutes after the checkout opens, or
-- 5 minutes after the payment window is closed or a payment fails. The API sends at most one per
-- order and includes a link that reopens the saved order (only a hash of its token is stored).

ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS reminder_due_at TIMESTAMPTZ;
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS resume_token_hash TEXT;

CREATE INDEX IF NOT EXISTS billing_orders_reminder_due_idx
  ON public.billing_orders (reminder_due_at)
  WHERE status = 'created' AND reminder_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';
