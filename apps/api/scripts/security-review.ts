/** Local, non-destructive reproduction harness. No real logins, emails or customer writes. */
import express from 'express';
import { once } from 'node:events';
import { getClientIp, checkAllowedOrigin } from '../src/utils/security';
import { consumeRateLimit } from '../src/middleware/rateLimit';
import { supabase } from '../src/services/db';
import accountRoutes from '../src/modules/accounts/account.routes';
import { testConnection } from '../src/controllers/crmController';
import { getSesClient } from '../src/aws';

async function main() {
const results: Record<string, unknown>[] = [];
const ses = getSesClient();
const original = { from: supabase.from, getUser: supabase.auth.getUser, update: supabase.auth.admin.updateUserById, send: ses.send };
let passwordWrites = 0;
const owner = 'audit-owner';
(supabase.auth as any).getUser = async () => ({ data: { user: { id: owner, email: 'local-audit@example.invalid', email_confirmed_at: new Date().toISOString() } }, error: null });
(supabase.auth.admin as any).updateUserById = async (id: string) => { if (id !== owner) throw new Error('Audit owner mismatch'); passwordWrites++; return { data: {}, error: null }; };
(ses as any).send = async () => ({ MessageId: 'mock-only-no-email-sent' });
(supabase as any).from = (table: string) => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: () => q, single: () => q, then: (resolve: any, reject: any) => Promise.resolve({ data: table === 'customer_accounts' ? { user_id: owner, status: 'active', password_set_at: 'set', onboarding_completed_at: 'done' } : { id: 'audit-bot', owner_id: owner, business_name: 'Local audit fixture' }, error: null }).then(resolve, reject) };
  return q;
};

const app = express(); app.use(express.json()); app.use('/account', accountRoutes);
let internalRequests = 0;
app.post('/audit-internal-service', (_req, res) => { internalRequests++; res.status(500).send('LOCAL_AUDIT_INTERNAL_MARKER'); });
const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}/account/password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-audit-session' }, body: JSON.stringify({ password: 'Audit-new-secret-42' }) });
  results.push({ finding: 'current_password_bypass', reproduced: response.status === 200 && passwordWrites === 1, httpStatus: response.status, passwordWritesWereMocked: true });

  const fixed = { ip: '192.0.2.10', socket: { remoteAddress: '192.0.2.10' } };
  const key = (forwarded: string) => getClientIp({ ...fixed, headers: { 'x-forwarded-for': forwarded } });
  const options = { keyPrefix: 'audit-only', limit: 1, windowMs: 60000 };
  consumeRateLimit(`audit:${key('198.51.100.1')}`, options);
  const blocked = consumeRateLimit(`audit:${key('198.51.100.1')}`, options);
  const bypass = consumeRateLimit(`audit:${key('198.51.100.2')}`, options);
  results.push({ finding: 'spoofable_ip_rate_limit', reproduced: !blocked.allowed && bypass.allowed, networkPeerStayedTheSame: true, realEndpointFlooded: false });

  const origin = checkAllowedOrigin({ headers: { origin: 'https://audit-untrusted.invalid', host: 'api.example.invalid', 'x-forwarded-host': 'audit-untrusted.invalid', 'x-forwarded-proto': 'https' } }, { allowedDomains: ['customer.example.invalid'], extraAllowedOrigins: ['https://app.example.invalid'], allowRuntimeOrigin: true, requireSource: true });
  results.push({ finding: 'forwarded_host_widget_origin_bypass', reproduced: origin.allowed, reason: origin.reason, needsForwardedHeaderToReachApp: true });

  let crmResponse: any; let crmStatus = 200;
  const res: any = { status: (code: number) => { crmStatus = code; return res; }, json: (body: any) => { crmResponse = body; } };
  await testConnection({ user: { id: owner }, params: { botId: 'audit-bot' }, body: { webhookUrl: `${base}/audit-internal-service`, apiKey: 'fake-local-audit-key' } } as any, res);
  results.push({ finding: 'crm_internal_network_ssrf', reproduced: internalRequests === 1 && crmResponse?.message === 'LOCAL_AUDIT_INTERNAL_MARKER', httpStatus: crmStatus, destinationWasLocalAuditServerOnly: true });
  console.log(JSON.stringify({ localAuditOnly: true, results }, null, 2));
} finally {
  supabase.from = original.from; supabase.auth.getUser = original.getUser; supabase.auth.admin.updateUserById = original.update; ses.send = original.send;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
