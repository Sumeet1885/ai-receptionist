CREATE TABLE public.checkout_followup_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.billing_orders(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK(stage IN ('started','closed','failed')),
  status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','sent','failed')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX checkout_followup_order_date_idx ON public.checkout_followup_emails(order_id,created_at DESC);
ALTER TABLE public.checkout_followup_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_followup_emails FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.checkout_followup_emails TO service_role;
ALTER TABLE public.billing_orders ADD COLUMN followup_claim_id uuid;
ALTER TABLE public.billing_orders ADD COLUMN followup_claimed_at timestamptz;
ALTER TABLE public.billing_orders ADD COLUMN followup_last_status text CHECK(followup_last_status IN ('sending','sent','failed'));
ALTER TABLE public.billing_orders ADD COLUMN followup_sent_at timestamptz;
ALTER TABLE public.billing_orders ADD COLUMN followup_sent_stage text CHECK(followup_sent_stage IN ('started','closed','failed'));

CREATE FUNCTION public.claim_checkout_followup(p_order uuid,p_admin uuid,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target billing_orders%ROWTYPE; message_id uuid; current_stage text;
BEGIN
  SELECT * INTO target FROM billing_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR target.status<>'created' THEN RETURN jsonb_build_object('reason','not_unpaid'); END IF;
  IF target.followup_claimed_at>now()-interval '5 minutes' THEN RETURN jsonb_build_object('reason','sending'); END IF;
  IF greatest(target.followup_sent_at,target.reminder_sent_at)>now()-interval '1 minute' THEN RETURN jsonb_build_object('reason','cooldown'); END IF;
  UPDATE checkout_followup_emails SET status='failed' WHERE order_id=p_order AND status='sending';
  current_stage := CASE WHEN target.payment_error IS NOT NULL THEN 'failed' WHEN target.checkout_dismissed_at IS NOT NULL THEN 'closed' ELSE 'started' END;
  INSERT INTO checkout_followup_emails(order_id,requested_by,stage,token_hash) VALUES(p_order,p_admin,current_stage,p_hash) RETURNING id INTO message_id;
  UPDATE billing_orders SET followup_claim_id=message_id,followup_claimed_at=now(),followup_last_status='sending' WHERE id=p_order;
  RETURN jsonb_build_object('id',message_id,'stage',current_stage);
END $$;

CREATE FUNCTION public.finish_checkout_followup(p_id uuid,p_sent boolean,p_message_id text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target checkout_followup_emails%ROWTYPE;
BEGIN
  SELECT * INTO target FROM checkout_followup_emails WHERE id=p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM billing_orders WHERE id=target.order_id FOR UPDATE;
  UPDATE checkout_followup_emails SET status=CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
    provider_message_id=p_message_id,sent_at=CASE WHEN p_sent THEN now() ELSE NULL END
  WHERE id=p_id AND status='sending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE billing_orders SET followup_claim_id=NULL,followup_claimed_at=NULL,
    followup_last_status=CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
    followup_sent_at=CASE WHEN p_sent THEN now() ELSE followup_sent_at END,
    followup_sent_stage=CASE WHEN p_sent THEN target.stage ELSE followup_sent_stage END,
    reminder_sent_at=CASE WHEN p_sent THEN coalesce(reminder_sent_at,now()) ELSE reminder_sent_at END
  WHERE id=target.order_id AND followup_claim_id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_checkout_followup(uuid,uuid,text),public.finish_checkout_followup(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_checkout_followup(uuid,uuid,text),public.finish_checkout_followup(uuid,boolean,text) TO service_role;
NOTIFY pgrst, 'reload schema';
