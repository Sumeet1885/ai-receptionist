import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../../config';
import { isSchemaOutOfDate } from '../../utils/asyncRoute';
import { logger } from '../../services/cloudwatchLogger';
import { emailTemplates, maskEmail, sendEmailSafely } from '../../services/email';
import { supabase } from '../../services/db';
import { formatMoney } from './pricing';
import type { BillingOrderRow } from './repository';

// One payment reminder per unpaid checkout. Due 30 minutes after the checkout opens (in case the
// tab is simply closed), or 5 minutes after the payment window is closed or a payment fails. A
// sweep in the API sends due reminders; the due time is in the database, so restarts lose
// nothing, and each reminder is claimed with a compare-and-set, so it goes out once even with
// several API instances.

export const REMINDER_AFTER_CHECKOUT_MS = 30 * 60_000;
export const REMINDER_AFTER_ABANDON_MS = 5 * 60_000;
const SWEEP_EVERY_MS = 60_000;
// A resume link from the reminder works this long.
export const RESUME_LINK_TTL_MS = 7 * 24 * 60 * 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Brings an unsent reminder forward to `at` (never later than one already set). */
export async function scheduleReminder(orderId: string, at: Date) {
  const iso = at.toISOString();
  const { error } = await supabase
    .from('billing_orders')
    .update({ reminder_due_at: iso })
    .eq('id', orderId)
    .eq('status', 'created')
    .is('reminder_sent_at', null)
    .or(`reminder_due_at.is.null,reminder_due_at.gt.${iso}`);
  if (error) logger.warn('[billing] could not schedule reminder', { order: orderId, error: error.message });
}

export function resumeUrl(orderId: string, token: string) {
  return `${config.clientUrl}/checkout?resume=${encodeURIComponent(`${orderId}.${token}`)}`;
}

/** The order a reminder link points at, if the token matches and it can still be paid. */
export function resumeTokenMatches(order: Pick<BillingOrderRow, 'resume_token_hash' | 'reminder_sent_at'>, token: string, now = Date.now()) {
  if (!order.resume_token_hash || !order.reminder_sent_at || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false;
  if (Date.parse(order.reminder_sent_at) + RESUME_LINK_TTL_MS < now) return false;
  const expected = Buffer.from(order.resume_token_hash, 'hex');
  const actual = Buffer.from(hashToken(token), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function sendDueReminders(now = new Date()) {
  const { data: due, error } = await supabase
    .from('billing_orders')
    .select('id')
    .eq('status', 'created')
    .is('reminder_sent_at', null)
    .not('razorpay_order_id', 'is', null)
    .lte('reminder_due_at', now.toISOString())
    .limit(25);
  if (error) throw new Error(`find due reminders: ${error.message}`);

  for (const { id } of due ?? []) {
    const token = randomBytes(24).toString('base64url');
    // Claim: only one sweep (or instance) gets each order.
    const { data: order, error: claimError } = await supabase
      .from('billing_orders')
      .update({ reminder_sent_at: new Date().toISOString(), resume_token_hash: hashToken(token) })
      .eq('id', id)
      .eq('status', 'created')
      .is('reminder_sent_at', null)
      .is('followup_claimed_at', null)
      .select('*')
      .maybeSingle<BillingOrderRow>();
    if (claimError || !order) continue;

    const sent = await sendEmailSafely(order.email, emailTemplates.paymentReminder({
      stage: order.payment_error ? 'failed' : order.checkout_dismissed_at ? 'closed' : 'started',
      name: order.full_name,
      businessName: order.business_name,
      planName: order.plan_snapshot.name,
      amount: formatMoney(order.total, order.currency),
      resumeUrl: resumeUrl(order.id, token),
      pricingUrl: `${config.clientUrl}/pricing`,
    }), 'checkout_payment_reminder');
    if (!sent.delivered) {
      await supabase.from('billing_orders').update({ reminder_sent_at: null, resume_token_hash: null, reminder_due_at: new Date(Date.now() + REMINDER_AFTER_ABANDON_MS).toISOString() }).eq('id', order.id).eq('resume_token_hash', hashToken(token)).eq('status', 'created');
    }
    logger.info('[billing] payment reminder', { order: order.id, to: maskEmail(order.email), delivered: sent.delivered });
  }
}

let timer: NodeJS.Timeout | undefined;
let warnedSchema = false;

export function startCheckoutReminders() {
  if (timer) return;
  const tick = () => sendDueReminders().catch((error) => {
    // Until the reminders migration is applied there is nothing to send; say so once, not every minute.
    if (isSchemaOutOfDate(error)) {
      if (!warnedSchema) logger.warn('[billing] payment reminders paused: run the pending database migrations', { error: error?.message });
      warnedSchema = true;
      return;
    }
    logger.error('[billing] reminder sweep failed', { error: error?.message });
  });
  timer = setInterval(tick, SWEEP_EVERY_MS);
  timer.unref();
  void tick();
}
