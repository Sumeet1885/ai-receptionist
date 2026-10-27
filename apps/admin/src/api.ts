export interface AdminSession {
  adminUser: {
    id: string;
    email: string;
    displayName: string;
    mustChangePassword: boolean;
  };
  roles: string[];
}

export class ApiError extends Error {
  // Per-field messages from the API's validation, for forms.
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

// The session lives in an httpOnly cookie; nothing auth-related is kept in browser storage.
async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || 'Request failed', data.fields);
  return data as T;
}

// ── billing ──────────────────────────────────────────────────────────────────
// Amounts are minor units (paise / cents); the forms show and accept whole rupees / dollars.

export type Currency = 'INR' | 'USD';

export interface Plan {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  contact_sales: boolean;
  monthly_minutes: number | null;
  price_inr: number;
  price_usd: number;
  setup_fee_inr: number;
  setup_fee_usd: number;
  max_agents: number | null;
  max_concurrent_calls: number | null;
  feature_values: Record<string, string>;
}

export interface PlanFeature {
  key: string;
  label: string;
  sort_order: number;
}

export interface PlanInput {
  slug: string;
  name: string;
  tagline: string;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  contactSales: boolean;
  monthlyMinutes: number | null;
  priceInr: number;
  priceUsd: number;
  setupFeeInr: number;
  setupFeeUsd: number;
  maxAgents: number | null;
  maxConcurrentCalls: number | null;
  featureValues: Record<string, string>;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  percent_off: number | string | null;
  amount_off_inr: number | null;
  amount_off_usd: number | null;
  applies_to: 'total' | 'plan' | 'setup';
  plan_ids: string[];
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CouponInput {
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  percentOff: number | null;
  amountOffInr: number | null;
  amountOffUsd: number | null;
  appliesTo: 'total' | 'plan' | 'setup';
  planIds: string[];
  maxRedemptions: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export type OrderStatus = 'created' | 'paid' | 'provisioned' | 'failed' | 'review';

export interface BillingOrder {
  id: string;
  status: OrderStatus;
  currency: Currency;
  total: number;
  discount: number;
  coupon_code: string | null;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  plan_snapshot: { name: string };
  razorpay_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  failure_reason: string | null;
  checkout_dismissed_at: string | null;
  payment_error: string | null;
}

export const billingAdminApi = {
  plans: () => request<{ plans: Plan[]; features: PlanFeature[] }>('/billing/plans'),
  createPlan: (body: PlanInput) => request<{ plan: Plan }>('/billing/plans', { method: 'POST', body }),
  updatePlan: (id: string, body: PlanInput) => request<{ plan: Plan }>(`/billing/plans/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  saveFeatures: (features: Array<{ key: string; label: string }>) => request<{ features: PlanFeature[] }>('/billing/features', { method: 'PUT', body: { features } }),
  coupons: () => request<{ coupons: Coupon[] }>('/billing/coupons'),
  createCoupon: (body: CouponInput) => request<{ coupon: Coupon }>('/billing/coupons', { method: 'POST', body }),
  updateCoupon: (id: string, body: CouponInput) => request<{ coupon: Coupon }>(`/billing/coupons/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  // view=revenue: paid orders; view=leads: unpaid checkouts, optionally one stage.
  orders: (params: { view: 'revenue' | 'leads'; status?: OrderStatus; stage?: LeadStage; page?: number }) => {
    const query = new URLSearchParams({ view: params.view });
    if (params.status) query.set('status', params.status);
    if (params.stage) query.set('stage', params.stage);
    if (params.page) query.set('page', String(params.page));
    return request<{ rows: BillingOrder[]; total: number; page: number; pageSize: number }>(`/billing/orders?${query.toString()}`);
  },
  revenue: () => request<RevenueSummary>('/billing/revenue'),
};

export type LeadStage = 'started' | 'closed' | 'failed';
type Money = Record<Currency, number>;

export interface RevenueSummary {
  totals: { allTime: Money; thisMonth: Money; last30Days: Money };
  counts: { allTime: number; thisMonth: number; last30Days: number };
  monthly: Array<{ month: string; count: number } & Money>;
  byPlan: Array<{ plan: string; count: number } & Money>;
  leads: { open: number; closed: number; failed: number; last30Days: number };
  conversionLast30Days: number | null;
}

// ── alert email recipients ───────────────────────────────────────────────────

export interface NotificationRecipient {
  id: string;
  email: string;
  label: string | null;
  notify_access_requests: boolean;
  notify_payments: boolean;
  notify_signup_leads: boolean;
  is_active: boolean;
  created_at: string;
}

export interface NotificationRecipientInput {
  email: string;
  label: string;
  accessRequests: boolean;
  payments: boolean;
  signupLeads: boolean;
  isActive: boolean;
}

export const notificationsApi = {
  list: () => request<{ recipients: NotificationRecipient[]; fallback: string[] }>('/notifications/recipients'),
  create: (body: NotificationRecipientInput) => request<{ recipient: NotificationRecipient }>('/notifications/recipients', { method: 'POST', body }),
  update: (id: string, body: NotificationRecipientInput) => request<{ recipient: NotificationRecipient }>(`/notifications/recipients/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  remove: (id: string) => request<{ ok: true }>(`/notifications/recipients/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  test: (id: string) => request<{ delivered: boolean }>(`/notifications/recipients/${encodeURIComponent(id)}/test`, { method: 'POST' }),
};

export function formatMoney(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

// ── access requests ──────────────────────────────────────────────────────────

export type AccessRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export interface AccessRequestSummary {
  id: string;
  status: AccessRequestStatus;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  industry: string;
  city: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AccessRequestDetail extends AccessRequestSummary {
  website: string | null;
  monthly_volume: string | null;
  languages: string[];
  use_case: string | null;
  ip: string | null;
  user_agent: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  provisioned_user_id: string | null;
  provisioned_at: string | null;
  activation_sent_at: string | null;
  activation_send_count: number;
  updated_at: string;
}

export interface AccessRequestList {
  rows: AccessRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AccessRequestStatus, number>;
}

export interface AccessRequestAccount {
  status: 'active' | 'suspended';
  activated: boolean;
  onboardingCompleted: boolean;
}

export const accessRequestApi = {
  list: (params: { status?: AccessRequestStatus; search?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    return request<AccessRequestList>(`/access-requests?${query.toString()}`);
  },
  get: (id: string) =>
    request<{ request: AccessRequestDetail; account: AccessRequestAccount | null }>(`/access-requests/${encodeURIComponent(id)}`),
  markContacted: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'contacted' } }),
  saveNotes: (id: string, adminNotes: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { adminNotes } }),
  reject: (id: string, reason: string, notify: boolean) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason, notify } }),
  approve: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} }),
  resendActivation: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/resend-activation`, { method: 'POST', body: {} }),
};

export const adminApi = {
  me: () => request<AdminSession>('/auth/me'),
  login: (email: string, password: string) =>
    request<AdminSession>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST', body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<AdminSession>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
};
