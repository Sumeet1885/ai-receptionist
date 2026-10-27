import { Router, type Response } from 'express';
import { config } from '../../config';
import { emailTemplates, sendEmail, sendEmailSafely } from '../../services/email';
import { publishStaffEvent } from '../../services/staffEvents';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import { createActivationLink } from '../accounts/links';
import { createCustomerAccount, getCustomerAccount } from '../accounts/repository';
import {
  adminOriginGuard,
  noStore,
  requireStaffRole,
  requireStaffSession,
  type StaffRequest,
} from '../staff-auth/middleware';
import { recordAudit } from '../staff-auth/repository';
import {
  authEmailExists,
  countByStatus,
  getAccessRequest,
  listAccessRequests,
  OPEN_STATUSES,
  transitionAccessRequest,
  updateAccessRequest,
  type AccessRequestRow,
  type AccessRequestStatus,
} from './repository';

// Staff review of free-access requests, mounted at /api/admin/access-requests.
// Reading needs read_only; triage (contacted, notes, reject, resend) needs support;
// approving, which creates a customer login, needs super_admin.

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: AccessRequestStatus[] = ['pending', 'contacted', 'approved', 'rejected'];
const PAGE_SIZE = 25;

const handle = (fn: (req: StaffRequest, res: Response) => Promise<unknown>) => asyncRoute<StaffRequest>('AccessRequestAdmin', fn);

router.use(noStore);
router.use(adminOriginGuard(config.admin.origin));
router.use(requireStaffSession);

function audit(req: StaffRequest, action: string, request: Pick<AccessRequestRow, 'id' | 'provisioned_user_id'>, outcome: 'succeeded' | 'failed' = 'succeeded', metadata: Record<string, unknown> = {}) {
  return recordAudit({
    action,
    decision: 'allowed',
    outcome,
    actor_principal_id: req.staff!.principal.id,
    actor_session_id: req.staff!.sessionId,
    tenant_owner_id: request.provisioned_user_id,
    resource_type: 'access_request',
    resource_id: request.id,
    ip: getClientIp(req),
    metadata,
  });
}

async function loadRequest(req: StaffRequest, res: Response) {
  if (!UUID.test(req.params.id)) {
    res.status(404).json({ error: 'Request not found' });
    return null;
  }
  const request = await getAccessRequest(req.params.id);
  if (!request) res.status(404).json({ error: 'Request not found' });
  return request;
}

async function sendActivation(request: AccessRequestRow) {
  const link = await createActivationLink({
    email: request.email,
    userId: request.provisioned_user_id,
    fullName: request.full_name,
    businessName: request.business_name,
  });
  await sendEmail(
    request.email,
    emailTemplates.workspaceActivation({ name: request.full_name, activationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
    'workspace_activation',
  );
  return link.userId;
}

router.get('/', requireStaffRole('read_only'), handle(async (req, res) => {
  const status = STATUSES.includes(req.query.status as AccessRequestStatus) ? req.query.status as AccessRequestStatus : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page ?? '1'), 10) || 1));
  const [{ rows, total }, counts] = await Promise.all([
    listAccessRequests({ status, search, page, pageSize: PAGE_SIZE }),
    countByStatus(),
  ]);
  res.json({ rows, total, page, pageSize: PAGE_SIZE, counts });
}));

router.get('/:id', requireStaffRole('read_only'), handle(async (req, res) => {
  const request = await loadRequest(req, res);
  if (!request) return;
  const account = request.provisioned_user_id ? await getCustomerAccount(request.provisioned_user_id) : null;
  res.json({
    request,
    account: account && {
      status: account.status,
      activated: Boolean(account.password_set_at),
      onboardingCompleted: Boolean(account.onboarding_completed_at),
    },
  });
}));

router.patch('/:id', requireStaffRole('support'), handle(async (req, res) => {
  const request = await loadRequest(req, res);
  if (!request) return;

  const changes: Partial<AccessRequestRow> = {};
  if (req.body?.staffNotes !== undefined) {
    if (typeof req.body.staffNotes !== 'string' || req.body.staffNotes.length > 2000) {
      return res.status(400).json({ error: 'Notes must be text under 2,000 characters' });
    }
    changes.staff_notes = req.body.staffNotes.trim() || null;
  }

  let updated: AccessRequestRow | null = request;
  if (req.body?.status === 'contacted') {
    updated = await transitionAccessRequest(request.id, ['pending'], {
      ...changes,
      status: 'contacted',
      reviewed_by: req.staff!.principal.id,
      reviewed_at: new Date().toISOString(),
    });
    if (!updated) return res.status(409).json({ error: 'Only pending requests can be marked as contacted' });
  } else if (req.body?.status !== undefined) {
    return res.status(400).json({ error: 'Use approve or reject to change this status' });
  } else if (Object.keys(changes).length) {
    updated = await updateAccessRequest(request.id, changes);
  }

  await audit(req, 'access_request.update', request, 'succeeded', { status: updated.status, notesChanged: 'staff_notes' in changes });
  publishStaffEvent({ type: 'access_request.updated', id: request.id, status: updated.status });
  res.json({ request: updated });
}));

router.post('/:id/reject', requireStaffRole('support'), handle(async (req, res) => {
  const request = await loadRequest(req, res);
  if (!request) return;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';

  const updated = await transitionAccessRequest(request.id, OPEN_STATUSES, {
    status: 'rejected',
    rejection_reason: reason || null,
    reviewed_by: req.staff!.principal.id,
    reviewed_at: new Date().toISOString(),
  });
  if (!updated) return res.status(409).json({ error: 'This request has already been decided' });

  if (req.body?.notify === true) {
    await sendEmailSafely(request.email, emailTemplates.accessRequestDeclined({ name: request.full_name, reason: reason || undefined }), 'access_request_declined');
  }
  await audit(req, 'access_request.reject', request, 'succeeded', { notified: req.body?.notify === true });
  publishStaffEvent({ type: 'access_request.updated', id: request.id, status: 'rejected' });
  res.json({ request: updated });
}));

router.post('/:id/approve', requireStaffRole('super_admin'), handle(async (req, res) => {
  const request = await loadRequest(req, res);
  if (!request) return;
  if (!OPEN_STATUSES.includes(request.status)) return res.status(409).json({ error: 'This request has already been decided' });
  if (await authEmailExists(request.email)) {
    return res.status(409).json({ error: 'A customer login already exists for this email. Reject this request or ask them to sign in.' });
  }

  // Claim first so a second approver cannot provision the same request twice.
  const claimed = await transitionAccessRequest(request.id, [request.status], {
    status: 'approved',
    reviewed_by: req.staff!.principal.id,
    reviewed_at: new Date().toISOString(),
  });
  if (!claimed) return res.status(409).json({ error: 'This request has already been decided' });

  try {
    const link = await createActivationLink({ email: request.email, fullName: request.full_name, businessName: request.business_name });
    const userId = link.userId;
    // Record the login first: from here on, a failure is recovered with "Resend activation".
    await updateAccessRequest(request.id, { provisioned_user_id: userId, provisioned_at: new Date().toISOString() });
    await createCustomerAccount(userId, request.id);
    await sendEmail(
      request.email,
      emailTemplates.workspaceActivation({ name: request.full_name, activationUrl: link.url, expiresInHours: config.email.linkExpiryHours }),
      'workspace_activation',
    );
  } catch (error: any) {
    const provisioned = await getAccessRequest(request.id);
    await audit(req, 'access_request.approve', request, 'failed', {
      stage: provisioned?.provisioned_user_id ? 'email' : 'provision',
      error: String(error?.message ?? error).slice(0, 300),
    });
    if (provisioned?.provisioned_user_id) {
      publishStaffEvent({ type: 'access_request.updated', id: request.id, status: 'approved' });
      return res.status(502).json({ error: 'The workspace was created but the activation email could not be sent. Use "Resend activation".' });
    }
    // Nothing was created: put the request back so it can be approved again.
    await transitionAccessRequest(request.id, ['approved'], { status: request.status, reviewed_by: request.reviewed_by, reviewed_at: request.reviewed_at });
    return res.status(502).json({ error: 'The workspace could not be created. Nothing was changed; try again.' });
  }

  const updated = await updateAccessRequest(request.id, {
    activation_sent_at: new Date().toISOString(),
    activation_send_count: request.activation_send_count + 1,
  });
  await audit(req, 'access_request.approve', updated);
  publishStaffEvent({ type: 'access_request.updated', id: request.id, status: 'approved' });
  res.json({ request: updated });
}));

router.post('/:id/resend-activation', requireStaffRole('support'), handle(async (req, res) => {
  const request = await loadRequest(req, res);
  if (!request) return;
  if (request.status !== 'approved' || !request.provisioned_user_id) {
    return res.status(409).json({ error: 'Only approved requests have an activation link' });
  }
  const account = await getCustomerAccount(request.provisioned_user_id);
  if (account?.password_set_at) return res.status(409).json({ error: 'This workspace is already activated' });
  if (!account) await createCustomerAccount(request.provisioned_user_id, request.id);

  await sendActivation(request);
  const updated = await updateAccessRequest(request.id, {
    activation_sent_at: new Date().toISOString(),
    activation_send_count: request.activation_send_count + 1,
  });
  await audit(req, 'access_request.resend_activation', updated);
  publishStaffEvent({ type: 'access_request.updated', id: request.id, status: updated.status });
  res.json({ request: updated });
}));

export default router;
