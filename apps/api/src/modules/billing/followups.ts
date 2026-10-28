import { createHash, randomBytes } from 'node:crypto';
import { config } from '../../config';
import { supabase } from '../../services/db';
import { emailTemplates, sendEmailSafely } from '../../services/email';
import { publishAdminEvent } from '../../services/adminEvents';
import { formatMoney } from './pricing';
import { getOrder, type BillingOrderRow, type LeadStage } from './repository';
import { resumeTokenMatches, resumeUrl } from './reminders';
import { razorpayConfigured } from './razorpay';

export const checkoutLeadStage = (
  order: Pick<BillingOrderRow, 'payment_error' | 'checkout_dismissed_at'>,
): LeadStage => (order.payment_error ? 'failed' : order.checkout_dismissed_at ? 'closed' : 'started');
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function followupContent(order: BillingOrderRow, token?: string) {
  const existingWorkspace = Boolean(order.customer_user_id);
  const canResume = Boolean(order.razorpay_order_id && order.password_hash && razorpayConfigured() && !existingWorkspace);
  const pricingUrl = `${config.clientUrl}/pricing`;
  return {
    stage: checkoutLeadStage(order),
    canResume,
    existingWorkspace,
    ...emailTemplates.paymentReminder({
      stage: checkoutLeadStage(order),
      name: order.full_name,
      businessName: order.business_name,
      planName: order.plan_snapshot.name,
      amount: formatMoney(order.total, order.currency),
      pricingUrl,
      canResume,
      existingWorkspace,
      resumeUrl: existingWorkspace
        ? `${config.clientUrl}/dashboard`
        : token
          ? resumeUrl(order.id, token)
          : pricingUrl,
    }),
  };
}

/** Each accepted send has its own expiring token, so resending does not invalidate older links. */
export async function validFollowupResume(order: BillingOrderRow, token: string) {
  if (resumeTokenMatches(order, token)) return true;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token) || order.customer_user_id) return false;
  const { data, error } = await supabase
    .from('checkout_followup_emails')
    .select('id')
    .eq('order_id', order.id)
    .eq('token_hash', tokenHash(token))
    .in('status', ['sending', 'sent'])
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export class FollowupError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function sendCheckoutFollowup(orderId: string, adminId: string, expectedStage: string) {
  // Stage is re-read at send time. Never trust a recipient, body, price, URL or status from the browser.
  const order = await getOrder(orderId);
  if (!order || order.status !== 'created')
    throw new FollowupError(409, 'This checkout is no longer an unpaid lead. Refresh the list.');
  if (checkoutLeadStage(order) !== expectedStage)
    throw new FollowupError(409, 'The checkout status changed. Reopen the email preview before sending.');
  const token = randomBytes(24).toString('base64url');
  const { data: claim, error } = await supabase.rpc('claim_checkout_followup', {
    p_order: orderId,
    p_admin: adminId,
    p_hash: tokenHash(token),
  });
  if (error) throw error;
  if (!claim?.id)
    throw new FollowupError(
      409,
      claim?.reason === 'cooldown'
        ? 'An email was sent recently. Wait one minute before sending another.'
        : claim?.reason === 'sending'
          ? 'An email is already being sent for this lead.'
          : 'This checkout is no longer unpaid. Refresh the list.',
    );
  let accepted = false;
  let messageId: string | undefined;
  try {
    const current = await getOrder(orderId);
    if (!current || current.status !== 'created' || checkoutLeadStage(current) !== expectedStage)
      throw new FollowupError(409, 'The checkout changed. Refresh the preview before sending.');
    const content = followupContent(current, token);
    const result = await sendEmailSafely(current.email, content, `checkout_followup_${content.stage}`);
    accepted = result.delivered;
    messageId = result.messageId;
  } finally {
    const result = await supabase.rpc('finish_checkout_followup', {
      p_id: claim.id,
      p_sent: accepted,
      p_message_id: messageId || null,
    });
    publishAdminEvent({ type: 'billing_order.updated', id: orderId, status: 'created' });
    if (result.error || !result.data)
      throw new FollowupError(
        503,
        accepted
          ? 'SES accepted the email, but its status could not be saved. Refresh before trying again.'
          : 'Could not save email status. Please refresh before trying again.',
      );
  }
  if (!accepted)
    throw new FollowupError(502, 'The email could not be sent. Check the API email logs and try again.');
  return { accepted: true, stage: claim.stage, messageId };
}
