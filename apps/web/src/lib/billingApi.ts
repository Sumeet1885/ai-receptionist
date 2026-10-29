import { publicRequest } from './publicForm';

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
  constructor(message: string, public field?: string, public fields?: Record<string, string>, public code?: string) {
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
  let result;
  try {
    result = await publicRequest(path, body);
  } catch (error) {
    throw new BillingError((error as Error).message);
  }
  if (!result.ok) throw new BillingError(result.message, result.data.field, result.data.fields, result.data.code);
  return result.data as T;
}

export const billingApi = {
  plans: () => call<{ plans: PublicPlan[]; features: PlanFeature[] }>('/plans'),
  quote: (plan: string, currency: Currency, couponCode: string) =>
    call<{ plan: PublicPlan; quote: Quote }>('/checkout/quote', { plan, currency, couponCode }),
  // Body includes the public-form guard fields (honeypot, fill time, Turnstile token).
  createOrder: (body: Record<string, unknown>) => call<CheckoutOrder>('/checkout/order', body),
  // Records a closed checkout or a failed payment attempt on the lead; best effort.
  // "Complete my payment" link from the reminder email: the saved order, ready to pay.
  resume: (resume: string) =>
    call<{ plan: PublicPlan; quote: Quote; businessName: string } & ({ requiresDetails: false; order: CheckoutOrder } | { requiresDetails: true; order: null; contact: { fullName: string; email: string; phone: string; businessName: string } })>('/checkout/resume', { resume }),
  abandoned: (body: { orderId: string; razorpayOrderId: string; reason: 'closed' | 'failed'; message?: string }) =>
    call<{ ok: true }>('/checkout/abandoned', body).catch(() => undefined),
  verify: (body: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    call<{ status: 'provisioned' | 'review' | 'paid' | 'pending' }>('/checkout/verify', body),
};
