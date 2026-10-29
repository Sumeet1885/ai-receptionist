import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config';

// Razorpay REST API (no SDK). Prices are always set here on the server; the browser only opens
// Checkout for an order id we created and reports back a signature we verify.

const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured() {
  return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Razorpay ${method} ${path}: ${data?.error?.description || response.status}`);
  return data as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  email?: string;
}

export function createRazorpayOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>('POST', '/orders', { ...input, payment_capture: 1 });
}

export function fetchPayment(paymentId: string) {
  return call<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);
}

export function capturePayment(paymentId: string, amount: number, currency: string) {
  return call<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency });
}

function safeEqualHex(expected: string, received: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

/** Checkout handler signature: HMAC-SHA256(order_id|payment_id) with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = config.razorpay.keySecret) {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret = config.razorpay.webhookSecret) {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
