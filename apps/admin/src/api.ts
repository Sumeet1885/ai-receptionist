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
  constructor(
    public status: number,
    message: string,
    // Per-field messages from the API's validation, for forms.
    public fields: Record<string, string> = {},
    // Server log reference for unexpected failures, to quote when reporting a problem.
    public reference?: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Fired when the session has ended, so the app returns to the sign-in screen. */
export const SESSION_EXPIRED_EVENT = 'admin:session-expired';
const TIMEOUT_MS = 20_000;

// A clear message for every way a call can fail; the server's own message wins when it has one.
function failureMessage(status: number, serverMessage: string | undefined, isAuthCall: boolean) {
  // Sign-in calls keep the server's wording ("Invalid email or password").
  if (status === 401) return isAuthCall && serverMessage ? serverMessage : 'Your session has ended. Please sign in again.';
  if (status === 403) return serverMessage || 'Your role does not allow this. Ask a super admin.';
  if (status === 404) return serverMessage || 'Not found. It may have been removed.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (serverMessage) return serverMessage;
  if (status === 502 || status === 503 || status === 504) return 'The server is not responding right now. Try again in a moment.';
  return 'Something went wrong on our side. Please try again.';
}

// The session lives in an httpOnly cookie; nothing auth-related is kept in browser storage.
export async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined || init.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(0, controller.signal.aborted
      ? 'The server took too long to respond. Check your connection and try again.'
      : 'Cannot reach the server. Check your connection, or try again in a moment.');
  } finally {
    window.clearTimeout(timer);
  }

  // Proxies answer some failures with HTML; never let that surface as a parse error.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // An ended session sends everyone back to sign in, except the calls that check the session.
    const isAuthCall = path.startsWith('/auth/');
    if (response.status === 401 && !isAuthCall) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const message = failureMessage(response.status, data.error, isAuthCall);
    throw new ApiError(response.status, data.reference ? `${message} (Reference ${data.reference})` : message, data.fields, data.reference, data.code);
  }
  return data as T;
}

// ── billing ──────────────────────────────────────────────────────────────────
// Amounts are minor units (paise / cents); the forms show and accept whole rupees / dollars.

export type Currency = 'INR' | 'USD';

export interface Plan {
  is_trial?: boolean;
  trial_days?: number | null;
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
  isTrial?: boolean;
  trialDays?: number | null;
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
  followup_last_status?: 'sending' | 'sent' | 'failed' | null;
  followup_sent_at?: string | null;
  followup_sent_stage?: LeadStage | null;
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
  reminder_sent_at: string | null;
}

export interface LeadEmailPreview {
  to: string; stage: LeadStage; subject: string; html: string; text: string;
  canResume: boolean; existingWorkspace: boolean; lastSentAt: string | null;
}

export const billingAdminApi = {
  leadEmailPreview: (id: string) => request<LeadEmailPreview>(`/billing/orders/${encodeURIComponent(id)}/email-preview`),
  sendLeadEmail: (id: string, stage: LeadStage) => request<{ accepted: boolean; stage: LeadStage; messageId?: string }>(`/billing/orders/${encodeURIComponent(id)}/send-email`, { method: 'POST', body: { stage } }),
  plans: (params: { page?: number; search?: string; activeOnly?: boolean; trialOnly?: boolean; checkoutOnly?: boolean } = {}) => request<{ plans: Plan[]; features: PlanFeature[]; total: number; page: number; pageSize: number }>(`/billing/plans?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  createPlan: (body: PlanInput) => request<{ plan: Plan }>('/billing/plans', { method: 'POST', body }),
  updatePlan: (id: string, body: PlanInput) => request<{ plan: Plan }>(`/billing/plans/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  saveFeatures: (features: Array<{ key: string; label: string }>) => request<{ features: PlanFeature[] }>('/billing/features', { method: 'PUT', body: { features } }),
  coupons: (page = 1) => request<{ coupons: Coupon[]; planNames: Record<string, string>; total: number; page: number; pageSize: number }>(`/billing/coupons?page=${page}`),
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
  notify_sales?: boolean;
  notify_support?: boolean;
  is_active: boolean;
  created_at: string;
}

export interface NotificationRecipientInput {
  email: string;
  label: string;
  accessRequests: boolean;
  payments: boolean;
  signupLeads: boolean;
  sales?: boolean;
  support?: boolean;
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

export interface AccessRequestNote {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
  is_imported: boolean;
}

export interface AccessRequestList {
  rows: AccessRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AccessRequestStatus, number>;
}

export interface AccessRequestAccount {
  planId?: string | null;
  trialDays?: number | null;
  accessMonths?: number | null;
  accessExpiresAt?: string | null;
  expiryDate?: string | null;
  startsAt?: string | null;
  status: 'active' | 'suspended';
  activated: boolean;
  onboardingCompleted: boolean;
}

export const accessRequestApi = {
  list: (params: { status?: AccessRequestStatus; search?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    return request<AccessRequestList>(`/access-requests?${query.toString()}`);
  },
  get: (id: string) =>
    request<{ request: AccessRequestDetail; account: AccessRequestAccount | null; notes: AccessRequestNote[] }>(`/access-requests/${encodeURIComponent(id)}`),
  markContacted: (id: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'contacted' } }),
  addNote: (id: string, body: string) =>
    request<{ note: AccessRequestNote }>(`/access-requests/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { body } }),
  reject: (id: string, reason: string, notify: boolean) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason, notify } }),
  approve: (id: string, planId?: string, expiryDate?: string, startDate?: string) =>
    request<{ request: AccessRequestDetail }>(`/access-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: { planId, expiryDate, startDate } }),
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

// ── customers ────────────────────────────────────────────────────────────────

export type CustomerStage = 'verify_email' | 'set_password' | 'onboarding' | 'active' | 'suspended' | 'payment_required' | 'scheduled';

export interface Customer {
  userId: string;
  email: string;
  name: string | null;
  businessName: string | null;
  status: 'active' | 'suspended';
  stage: CustomerStage;
  source: 'paid' | 'access_request' | 'existing';
  plan: { name: string; currency: string | null; periodEnd: string | null; startsAt?: string | null } | null;
  agents: number;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
}

export interface BotSummary {
  id: string;
  business_name: string;
  industry: string;
  dograh_phone_number: string | null;
  dograh_workflow_id: string | null;
  dograh_outbound_workflow_id: string | null;
  is_active: boolean;
  created_at: string;
  owner_id: string;
}

export interface AgentLimitInfo {
  current: number;
  effectiveLimit: number | null;
  customLimit: number | null;
  planLimit: number | null;
  planName: string;
}

export interface CustomerAgentsResponse {
  assigned: BotSummary[];
  all: BotSummary[];
  availableNumbers: string[];
  agentLimit?: AgentLimitInfo;
}

export const customersApi = {
  list: (params: { stage?: CustomerStage; search?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params.stage) query.set('stage', params.stage);
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    return request<{ rows: Customer[]; total: number; page: number; pageSize: number; counts: Record<'all' | CustomerStage, number> }>(`/customers?${query.toString()}`);
  },
  setStatus: (userId: string, status: 'active' | 'suspended') =>
    request<{ ok: true; status: string }>(`/customers/${encodeURIComponent(userId)}/status`, { method: 'POST', body: { status } }),
  resend: (userId: string) => request<{ ok: true }>(`/customers/${encodeURIComponent(userId)}/resend`, { method: 'POST' }),
  getAgents: (userId: string) =>
    request<CustomerAgentsResponse>(`/customers/${encodeURIComponent(userId)}/agents`),
  assignAgent: (userId: string, botId: string) =>
    request<{ ok: true; botId: string }>(`/customers/${encodeURIComponent(userId)}/assign-agent`, { method: 'POST', body: { botId } }),
  unassignAgent: (userId: string, data: { botId: string; detachPhoneNumber?: boolean }) =>
    request<{ ok: true; botId: string }>(`/customers/${encodeURIComponent(userId)}/unassign-agent`, { method: 'POST', body: data }),
  updateAgentLimit: (userId: string, data: { limit: number | null }) =>
    request<{ ok: true; agentLimit: AgentLimitInfo }>(`/customers/${encodeURIComponent(userId)}/agent-limit`, { method: 'POST', body: data }),
  createAgent: (userId: string, data: { businessName: string; industry?: string; greeting?: string; phoneNumber?: string }) =>
    request<{ ok: true; bot: BotSummary }>(`/customers/${encodeURIComponent(userId)}/create-agent`, { method: 'POST', body: data }),
  assignNumber: (userId: string, data: { botId: string; phoneNumber: string }) =>
    request<{ ok: true; bot: BotSummary }>(`/customers/${encodeURIComponent(userId)}/assign-number`, { method: 'POST', body: data }),
  unassignNumber: (userId: string, data: { botId: string }) =>
    request<{ ok: true; bot: BotSummary }>(`/customers/${encodeURIComponent(userId)}/unassign-number`, { method: 'POST', body: data }),
};
