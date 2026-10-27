import { config } from '../../config';
import { logger } from '../../services/cloudwatchLogger';
import { emailTemplates, maskEmail, sendEmailSafely } from '../../services/email';
import { publishAdminEvent } from '../../services/adminEvents';
import { supabase } from '../../services/db';
import { createVerificationLink } from '../accounts/links';
import { createCustomerAccount, markCustomerAccount } from '../accounts/repository';
import { authEmailExists } from '../access-requests/repository';
import { notifyAdmins as sendAdminAlert } from '../notifications';
import { formatMoney } from './pricing';
import { getOrder, redeemCoupon, setCustomerPlan, transitionOrder, updateOrder, type BillingOrderRow } from './repository';

// A claimed order whose provisioning never finished (process died) may be retried after this.
const STALE_PAID_MS = 2 * 60_000;

/**
 * Turns a confirmed payment into a workspace: marks the order paid, counts the coupon, creates the
 * login (with the password chosen at checkout, email not yet confirmed) and the plan, and emails the
 * link that confirms the address. Until it is clicked the account stays at the verify_email stage.
 * Safe to call more than once for the
 * same payment (checkout callback and webhook both call it): only the caller that claims the order
 * provisions it.
 */
export async function fulfilPaidOrder(order: BillingOrderRow, razorpayPaymentId: string): Promise<BillingOrderRow> {
  let claimed = await transitionOrder(order.id, ['created', 'failed'], {
    status: 'paid',
    razorpay_payment_id: razorpayPaymentId,
    paid_at: new Date().toISOString(),
    failure_reason: null,
  });

  if (!claimed) {
    const current = (await getOrder(order.id))!;
    const stale = current.status === 'paid' && Date.parse(current.updated_at) + STALE_PAID_MS < Date.now();
    if (!stale) return current;
    claimed = current;
  } else if (claimed.coupon_id && !(await redeemCoupon(claimed.coupon_id))) {
    // Paid at the quoted price, so the order stands; the coupon simply hit its limit concurrently.
    logger.warn('[billing] coupon limit reached after payment', { order: claimed.id, coupon: claimed.coupon_code });
  }

  const planName = claimed.plan_snapshot.name;
  const amount = formatMoney(claimed.total, claimed.currency);

  if (await authEmailExists(claimed.email)) {
    const review = await updateOrder(claimed.id, {
      status: 'review',
      failure_reason: 'Paid, but a login already exists for this email. Attach the plan to that account by hand.',
      password_hash: null,
    });
    publishAdminEvent({ type: 'billing_order.updated', id: review.id, status: review.status });
    return review;
  }

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: claimed.email,
    password_hash: claimed.password_hash!,
    email_confirm: false,
    user_metadata: { full_name: claimed.full_name, business_name: claimed.business_name },
  });
  if (error || !created?.user) throw new Error(`create paid user: ${error?.message ?? 'no user returned'}`);
  const userId = created.user.id;

  await createCustomerAccount(userId, null);
  await markCustomerAccount(userId, { password_set_at: new Date().toISOString() });
  await setCustomerPlan(userId, claimed);
  const done = await updateOrder(claimed.id, {
    status: 'provisioned',
    provisioned_user_id: userId,
    provisioned_at: new Date().toISOString(),
    password_hash: null,
  });

  const link = await createVerificationLink(claimed.email);
  const sent = await sendEmailSafely(
    claimed.email,
    emailTemplates.emailVerification({
      verificationUrl: link.url,
      expiresInHours: config.email.linkExpiryHours,
      purchase: { name: claimed.full_name, planName, amount },
    }),
    'paid_signup_verification',
  );
  if (!sent.delivered && config.email.from) {
    logger.error('[billing] verification email failed; the customer can request a new one', { order: done.id, to: maskEmail(claimed.email) });
  }

  publishAdminEvent({ type: 'billing_order.updated', id: done.id, status: done.status });
  void notifyAdmins(done, amount).catch(() => undefined);
  return done;
}

async function notifyAdmins(order: BillingOrderRow, amount: string) {
  const content = emailTemplates.adminNewPayment({
    name: order.full_name,
    email: order.email,
    businessName: order.business_name,
    planName: order.plan_snapshot.name,
    amount,
    consoleUrl: `${config.admin.origin}${config.admin.basePath}revenue`,
  });
  await sendAdminAlert('payments', content, 'admin_new_payment');
}
