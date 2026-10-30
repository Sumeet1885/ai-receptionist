import { notifyAdmins } from '../notifications';
import { requireWorkspaceAccess } from '../../middleware/workspaceAccess';
import { Router, type Request, type Response } from 'express';
import {
  SALES_SUPPORT_CATEGORY,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportNumber,
  validateSupport,
} from '@ai-receptionist/contracts';
import { config } from '../../config';
import { requireAuth, type AuthRequest } from '../../middleware/auth';
import { publicFormGuards, publicHeaders, publicOriginGuard } from '../../middleware/publicFormGuards';
import { createRateLimit } from '../../middleware/rateLimit';
import { supabase } from '../../services/db';
import { emailTemplates, sendEmailSafely } from '../../services/email';
import { publishAdminEvent } from '../../services/adminEvents';
import { asyncRoute } from '../../utils/asyncRoute';
import { getClientIp } from '../../utils/security';
import {
  adminOriginGuard,
  noStore,
  requireAdminRole,
  requireAdminSession,
  type AdminRequest,
} from '../admin-auth/middleware';
import { recordAudit } from '../admin-auth/repository';
import { checked, supportDetail, supportSettings, supportTicket } from './repository';
import { customerSupportView, hashSupportToken, newSupportToken, validSupportToken } from './security';
import { supportUpload, withSupportFiles } from './uploads';
import { supportDownloadUrl } from './storage';

export const supportPublicRoutes = Router();
export const supportCustomerRoutes = Router();
export const supportAdminRoutes = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const handle = (fn: (req: AuthRequest & AdminRequest, res: Response) => Promise<unknown>) =>
  asyncRoute('Support', fn);
const limit = (name: string, amount: number, minutes: number, key?: (req: Request) => string | null) =>
  createRateLimit({ keyPrefix: `support-${name}`, limit: amount, windowMs: minutes * 60_000 }, key);
const byUser = (req: Request) => (req as AuthRequest).user?.id ?? null;
const token = (req: Request) => req.get('x-support-token') ?? '';
const guestLink = (value: string) => `${config.clientUrl}/contact-support/ticket#token=${value}`;
const changed = (id: string) => publishAdminEvent({ type: 'support.updated', id });

async function audit(req: AdminRequest, action: string, id: string, metadata: Record<string, unknown> = {}) {
  await recordAudit({
    action: `support.${action}`,
    decision: 'allowed',
    outcome: 'succeeded',
    actor_admin_user_id: req.admin!.adminUser.id,
    actor_session_id: req.admin!.sessionId,
    resource_type: 'support_ticket',
    resource_id: id,
    ip: getClientIp(req),
    metadata,
  });
}
async function notify(ticket: any, url: string, created: boolean) {
  // Guest confirmations contain no user-controlled subject, name or description.
  await sendEmailSafely(
    ticket.email,
    emailTemplates.supportNotice({ number: supportNumber(ticket.ticket_number), url, created, sales: ticket.category === SALES_SUPPORT_CATEGORY.id }),
    created ? 'support_received' : 'support_updated',
  );
}
async function guestTicket(req: Request, res: Response) {
  if (!validSupportToken(token(req))) {
    res.status(404).json({ error: 'Ticket link is invalid or expired.' });
    return null;
  }
  const resGuest = await supabase
    .from('support_tickets')
    .select('*')
    .eq('guest_token_hash', hashSupportToken(token(req)))
    .gt('guest_expires_at', new Date().toISOString())
    .maybeSingle();
  if (resGuest.error && (resGuest.error.code === '42P01' || resGuest.error.code === 'PGRST205' || resGuest.error.message?.includes('support_tickets') || resGuest.error.message?.includes('schema cache'))) {
    res.status(404).json({ error: 'Ticket link is invalid or expired.' });
    return null;
  }
  const ticket = checked(resGuest);
  if (!ticket) res.status(404).json({ error: 'Ticket link is invalid or expired.' });
  return ticket;
}
async function ownedTicket(req: AuthRequest, res: Response) {
  if (!UUID.test(req.params.id)) {
    res.status(404).json({ error: 'Ticket not found.' });
    return null;
  }
  const resTicket = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (resTicket.error && (resTicket.error.code === '42P01' || resTicket.error.code === 'PGRST205' || resTicket.error.message?.includes('support_tickets') || resTicket.error.message?.includes('schema cache'))) {
    res.status(404).json({ error: 'Ticket not found.' });
    return null;
  }
  const ticket = checked(resTicket);
  if (!ticket) res.status(404).json({ error: 'Ticket not found.' });
  return ticket;
}
async function adminTicket(req: Request, res: Response) {
  const ticket = UUID.test(req.params.id) ? await supportTicket(req.params.id) : null;
  if (!ticket) res.status(404).json({ error: 'Ticket not found.' });
  return ticket;
}
async function create(req: AuthRequest, res: Response, guest: boolean) {
  const parsed = validateSupport(req.body?.intent === 'sales' ? { ...req.body, category: SALES_SUPPORT_CATEGORY.id } : req.body, guest);
  if (!parsed.ok)
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields: parsed.errors });
  const category = (await supportSettings()).categories.find(
    (c) => c.id === parsed.value.category && !c.archived,
  );
  if (!category)
    return res
      .status(400)
      .json({
        error: 'Choose an available category.',
        fields: { category: 'Choose an available category.' },
      });
  const value = parsed.value;
  const privateToken = guest ? newSupportToken() : null;
  const id = await withSupportFiles((req.files ?? []) as Express.Multer.File[], async (files) =>
    checked(
      await supabase.rpc('create_support_ticket', {
        p_ticket: {
          user_id: guest ? null : req.user!.id,
          name: guest ? value.name : req.user!.name || req.user!.email || 'Customer',
          email: guest ? value.email : req.user!.email,
          phone: guest ? value.phone : '',
          subject:
            value.subject || `${category.name}: ${value.description.slice(0, 100).replace(/\n/g, ' ')}`,
          category: category.id,
          priority: category.defaultPriority,
          guest_token_hash: privateToken ? hashSupportToken(privateToken) : null,
          guest_expires_at: privateToken ? new Date(Date.now() + 180 * 86400_000).toISOString() : null,
        },
        p_body: value.description,
        p_files: files,
      }),
    ),
  );
  const ticket = await supportTicket(id);
  changed(id);
  const url = privateToken ? guestLink(privateToken) : `${config.clientUrl}/support?ticket=${id}`;
  const delivery = await sendEmailSafely(
    ticket.email,
    emailTemplates.supportNotice({ number: supportNumber(ticket.ticket_number), url, created: true, sales: category.id === SALES_SUPPORT_CATEGORY.id }),
    'support_received',
  );
  void notifyAdmins(category.id === SALES_SUPPORT_CATEGORY.id ? 'sales' : 'support',
    emailTemplates.supportAdminAlert({ number: supportNumber(ticket.ticket_number), subject: ticket.subject,
      category: category.name, sales: category.id === SALES_SUPPORT_CATEGORY.id,
      url: `${config.admin.origin}${config.admin.basePath}support?ticket=${id}` }),
    category.id === SALES_SUPPORT_CATEGORY.id ? 'sales_enquiry_admin_alert' : 'support_admin_alert');
  // Never disclose a guest's private token or ticket body in the submission response.
  res
    .status(201)
    .json(
      guest
        ? { ticketNumber: supportNumber(ticket.ticket_number), emailSent: delivery.delivered }
        : { ticket: customerSupportView(ticket), emailSent: delivery.delivered },
    );
}
async function reply(
  req: AuthRequest & AdminRequest,
  res: Response,
  ticket: any,
  admin: boolean,
  url: string,
) {
  const body = typeof req.body?.body === 'string' ? req.body.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!body || body.length > 5000)
    return res.status(400).json({ error: 'Enter a reply between 1 and 5,000 characters.' });
  const internal = admin && (req.body.isInternal === true || req.body.isInternal === 'true');
  await withSupportFiles((req.files ?? []) as Express.Multer.File[], async (files) =>
    checked(
      await supabase.rpc('reply_support_ticket', {
        p_id: ticket.id,
        p_body: body,
        p_sender: admin ? 'admin' : 'customer',
        p_name: admin ? req.admin!.adminUser.display_name : ticket.name,
        p_internal: internal,
        p_files: files,
      }),
    ),
  );
  if (admin) await audit(req, internal ? 'internal_note' : 'reply', ticket.id);
  changed(ticket.id);
  if (admin && !internal) {
    // Hashed guest tokens cannot be recovered. Guests keep their original private link;
    // update notifications direct them back to that confirmation email.
    await notify(ticket, ticket.guest_token_hash ? '' : url, false);
  }
  const updated = await supportDetail(await supportTicket(ticket.id), admin);
  res.json({ ticket: admin ? adminView(updated) : customerSupportView(updated) });
}
function adminView(ticket: any) {
  const { guest_token_hash, guest_expires_at, ...view } = ticket;
  return view;
}
async function attachment(req: Request, res: Response, ticket: any, admin: boolean) {
  if (!UUID.test(req.params.fileId)) return res.status(404).json({ error: 'Attachment not found.' });
  const file = checked(
    await supabase
      .from('support_attachments')
      .select('storage_key,file_name,message:support_messages!inner(ticket_id,is_internal)')
      .eq('id', req.params.fileId)
      .eq('message.ticket_id', ticket.id)
      .maybeSingle(),
  );
  if (!file || (!admin && (file.message as any).is_internal))
    return res.status(404).json({ error: 'Attachment not found.' });
  res.json({ url: await supportDownloadUrl(file.storage_key, file.file_name) });
}

supportPublicRoutes.use(publicHeaders, publicOriginGuard);
supportPublicRoutes.get(
  '/categories',
  handle(async (_req, res) => {
    const settings = await supportSettings();
    res.json({
      categories: settings.categories.filter((c) => !c.archived).map(({ id, name }) => ({ id, name })),
    });
  }),
);
const guards = publicFormGuards('support-create', {
  floodPer10Min: 30,
  perIpPerHour: 10,
  perEmailPerHour: 3,
});
supportPublicRoutes.post(
  '/',
  limit('attempts', 30, 15),
  supportUpload(true),
  ...guards,
  handle((req, res) => create(req, res, true)),
);
supportPublicRoutes.use(
  '/ticket',
  limit('guest-read-ip', 600, 15),
  limit('guest-read-token', 120, 15, (req) => hashSupportToken(token(req))),
);
supportPublicRoutes.get(
  '/ticket',
  handle(async (req, res) => {
    const ticket = await guestTicket(req, res);
    if (ticket) res.json({ ticket: customerSupportView(await supportDetail(ticket, false)) });
  }),
);
supportPublicRoutes.post(
  '/ticket/messages',
  limit('guest-reply-ip', 60, 15),
  limit('guest-reply-token', 15, 15, (req) => hashSupportToken(token(req))),
  handle(async (req, res) => {
    const ticket = await guestTicket(req, res);
    if (!ticket) return;
    supportUpload(false)(req, res, (error) => {
      if (error) return;
      void reply(req, res, ticket, false, '').catch(() => {
        if (!res.headersSent) res.status(500).json({ error: 'Could not send reply. Please try again.' });
      });
    });
  }),
);
supportPublicRoutes.get(
  '/ticket/attachments/:fileId',
  handle(async (req, res) => {
    const ticket = await guestTicket(req, res);
    if (ticket) await attachment(req, res, ticket, false);
  }),
);

supportCustomerRoutes.use(noStore, requireAuth, requireWorkspaceAccess);
supportCustomerRoutes.get(
  '/',
  handle(async (req, res) => {
    const page = Math.max(1, Math.min(1000, Math.floor(Number(req.query.page) || 1)));
    const result = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user!.id)
      .order('updated_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (result.error && (result.error.code === '42P01' || result.error.code === 'PGRST205' || result.error.message?.includes('support_tickets') || result.error.message?.includes('schema cache'))) {
      return res.json({ tickets: [], total: 0, page });
    }
    res.json({ tickets: checked(result).map(customerSupportView), total: result.count, page });
  }),
);
supportCustomerRoutes.post(
  '/',
  limit('customer-create', 20, 60, byUser),
  supportUpload(true),
  handle((req, res) => create(req, res, false)),
);
supportCustomerRoutes.get(
  '/:id',
  handle(async (req, res) => {
    const ticket = await ownedTicket(req, res);
    if (ticket) res.json({ ticket: customerSupportView(await supportDetail(ticket, false)) });
  }),
);
supportCustomerRoutes.post(
  '/:id/messages',
  limit('customer-reply', 60, 15, byUser),
  supportUpload(false),
  handle(async (req, res) => {
    const ticket = await ownedTicket(req, res);
    if (ticket) await reply(req, res, ticket, false, '');
  }),
);
supportCustomerRoutes.post(
  '/:id/status',
  limit('customer-status', 30, 15, byUser),
  handle(async (req, res) => {
    const ticket = await ownedTicket(req, res);
    if (!ticket) return;
    if (!['open', 'closed'].includes(req.body?.status))
      return res.status(400).json({ error: 'Choose open or closed.' });
    const updated = checked(
      await supabase
        .from('support_tickets')
        .update({ status: req.body.status, updated_at: new Date().toISOString(), admin_unread: true })
        .eq('id', ticket.id)
        .select('*')
        .single(),
    );
    changed(ticket.id);
    res.json({ ticket: customerSupportView(updated) });
  }),
);
supportCustomerRoutes.get(
  '/:id/attachments/:fileId',
  handle(async (req, res) => {
    const ticket = await ownedTicket(req, res);
    if (ticket) await attachment(req, res, ticket, false);
  }),
);

supportAdminRoutes.use(noStore, adminOriginGuard(config.admin.origins), requireAdminSession);
supportAdminRoutes.get(
  '/settings',
  requireAdminRole('read_only'),
  handle(async (_req, res) => res.json(await supportSettings())),
);
supportAdminRoutes.put(
  '/settings',
  requireAdminRole('super_admin'),
  handle(async (req, res) => {
    const { categories, retention_days } = req.body ?? {};
    if (
      !Array.isArray(categories) ||
      categories.length < 1 ||
      categories.length > 31 ||
      categories.some(
        (c: any) =>
          !c ||
          !/^[a-z][a-z0-9_]{0,49}$/.test(c.id) ||
          typeof c.name !== 'string' ||
          !c.name.trim() ||
          c.name.length > 60 ||
          !SUPPORT_PRIORITIES.includes(c.defaultPriority) ||
          (c.archived !== undefined && typeof c.archived !== 'boolean'),
      ) ||
      new Set(categories.map((c: any) => c.id)).size !== categories.length ||
      !categories.some((c: any) => !c.archived) ||
      !Number.isInteger(retention_days) ||
      retention_days < 0 ||
      retention_days > 3650
    )
      return res
        .status(400)
        .json({
          error:
            'Keep at least one active category, unique category IDs, valid priorities, and retention between 0 and 3,650 days.',
        });
    const sales = categories.find((c: any) => c.id === SALES_SUPPORT_CATEGORY.id);
    if (!sales || sales.name !== SALES_SUPPORT_CATEGORY.name || sales.defaultPriority !== SALES_SUPPORT_CATEGORY.defaultPriority || sales.archived) return res.status(400).json({ error: 'Pricing & sales is a built-in category and cannot be changed or archived.' });
    const previous = await supportSettings();
    if (previous.categories.some((old) => !categories.some((c: any) => c.id === old.id)))
      return res.status(400).json({ error: 'Archive existing categories instead of deleting them.' });
    checked(await supabase.from('support_settings').update({ categories, retention_days }).eq('id', true));
    await audit(req, 'settings', 'settings', { retention_days });
    res.json(await supportSettings());
  }),
);
supportAdminRoutes.get(
  '/',
  requireAdminRole('read_only'),
  handle(async (req, res) => {
    const page = Math.max(1, Math.min(1000, Math.floor(Number(req.query.page) || 1)));
    let query = supabase
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (SUPPORT_STATUSES.includes(req.query.status as any)) query = query.eq('status', req.query.status);
    if (SUPPORT_PRIORITIES.includes(req.query.priority as any))
      query = query.eq('priority', req.query.priority);
    const search = String(req.query.search || '')
      .slice(0, 100)
      .replace(/[^\p{L}\p{N}@ ._-]/gu, '');
    if (search) query = query.or(`subject.ilike.%${search}%,email.ilike.%${search}%`);
    if (req.query.category === SALES_SUPPORT_CATEGORY.id) query = query.eq('category', SALES_SUPPORT_CATEGORY.id);
    if (req.query.unread === 'true') query = query.eq('admin_unread', true);
    const result = await query;
    if (result.error && (result.error.code === '42P01' || result.error.code === 'PGRST205' || result.error.message?.includes('support_tickets') || result.error.message?.includes('schema cache'))) {
      return res.json({ tickets: [], total: 0, page });
    }
    res.json({ tickets: checked(result).map(adminView), total: result.count, page });
  }),
);
supportAdminRoutes.get(
  '/:id',
  requireAdminRole('read_only'),
  handle(async (req, res) => {
    const ticket = await adminTicket(req, res);
    if (ticket) res.json({ ticket: adminView(await supportDetail(ticket, true)) });
  }),
);
supportAdminRoutes.patch(
  '/:id',
  requireAdminRole('support'),
  handle(async (req, res) => {
    const ticket = await adminTicket(req, res);
    if (!ticket) return;
    const changes: Record<string, unknown> = {};
    if (req.body.status !== undefined) {
      if (!SUPPORT_STATUSES.includes(req.body.status))
        return res.status(400).json({ error: 'Invalid status.' });
      changes.status = req.body.status;
    }
    if (req.body.priority !== undefined) {
      if (!SUPPORT_PRIORITIES.includes(req.body.priority))
        return res.status(400).json({ error: 'Invalid priority.' });
      changes.priority = req.body.priority;
    }
    if (req.body.category !== undefined) {
      if (ticket.category === SALES_SUPPORT_CATEGORY.id && req.body.category !== SALES_SUPPORT_CATEGORY.id) return res.status(400).json({ error: 'The Pricing & sales category is fixed for this enquiry.' });
      if (!(await supportSettings()).categories.some((c) => c.id === req.body.category && !c.archived))
        return res.status(400).json({ error: 'Invalid category.' });
      changes.category = req.body.category;
    }
    if (req.body.admin_unread !== undefined) {
      if (typeof req.body.admin_unread !== 'boolean')
        return res.status(400).json({ error: 'Invalid read state.' });
      changes.admin_unread = req.body.admin_unread;
    }
    const updated = checked(
      await supabase
        .from('support_tickets')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .select('*')
        .single(),
    );
    await audit(req, 'update', ticket.id, changes);
    changed(ticket.id);
    if (changes.status && changes.status !== ticket.status)
      await notify(
        ticket,
        ticket.guest_token_hash ? '' : `${config.clientUrl}/support?ticket=${ticket.id}`,
        false,
      );
    res.json({ ticket: adminView(await supportDetail(updated, true)) });
  }),
);
supportAdminRoutes.post(
  '/:id/messages',
  requireAdminRole('support'),
  limit('admin-reply', 60, 15, (req) => (req as AdminRequest).admin!.adminUser.id),
  supportUpload(false),
  handle(async (req, res) => {
    const ticket = await adminTicket(req, res);
    if (ticket) await reply(req, res, ticket, true, `${config.clientUrl}/support?ticket=${ticket.id}`);
  }),
);
supportAdminRoutes.get(
  '/:id/attachments/:fileId',
  requireAdminRole('read_only'),
  handle(async (req, res) => {
    const ticket = await adminTicket(req, res);
    if (ticket) {
      await audit(req, 'attachment', ticket.id);
      await attachment(req, res, ticket, true);
    }
  }),
);
