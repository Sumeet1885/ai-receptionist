const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';

export type Currency = 'INR' | 'USD';

export interface PublicPlan {
  slug: string;
  name: string;
  tagline: string | null;
  featured: boolean;
  contactSales: boolean;
  monthlyMinutes: number | null;
  price: Record<Currency, number>;
  setupFee: Record<Currency, number>;
  maxAgents: number | null;
  maxConcurrentCalls: number | null;
  features: Record<string, string>;
}

export interface PlanFeature {
  key: string;
  label: string;
}

export interface Quote {
  currency: Currency;
  planAmount: number;
  setupFee: number;
  discount: number;
  total: number;
  coupon: { code: string; description: string | null } | null;
}

export interface CheckoutOrder {
  orderId: string;
  razorpayOrderId: string;
  keyId: string;
  amount: number;
  currency: Currency;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

export class BillingError extends Error {
  constructor(message: string, public field?: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/** Minor units (paise / cents) → "₹7,990" / "$100". */
export function formatMoney(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${expressUrl}/api/public${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new BillingError('Too many attempts. Please wait a few minutes and try again.');
  if (!response.ok) throw new BillingError(data.error || 'Something went wrong. Please try again.', data.field, data.fields);
  return data as T;
}

export const billingApi = {
  plans: () => call<{ plans: PublicPlan[]; features: PlanFeature[] }>('/plans'),
  quote: (plan: string, currency: Currency, couponCode: string) =>
    call<{ plan: PublicPlan; quote: Quote }>('/checkout/quote', { plan, currency, couponCode }),
  // Body includes the public-form guard fields (honeypot, fill time, Turnstile token).
  createOrder: (body: Record<string, unknown>) => call<CheckoutOrder>('/checkout/order', body),
  // Records a closed checkout or a failed payment attempt on the lead; best effort.
  abandoned: (body: { orderId: string; razorpayOrderId: string; reason: 'closed' | 'failed'; message?: string }) =>
    call<{ ok: true }>('/checkout/abandoned', body).catch(() => undefined),
  verify: (body: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    call<{ status: 'provisioned' | 'review' | 'paid' | 'pending' }>('/checkout/verify', body),
};
