import crypto from 'crypto';
import { LeadData } from '../controllers/leadController';

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500];
const REQUEST_TIMEOUT_MS = 8000;

export interface CrmConnection {
  webhook_url: string;
  api_key: string;
  signing_secret?: string | null;
}

export interface CrmSyncContext {
  sessionId: string;
  businessName?: string;
}

export function isCrmSyncEnabled(connection?: CrmConnection | null): boolean {
  return Boolean(connection?.webhook_url && connection?.api_key);
}

function cleanExtra(obj: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    const s = String(value).trim();
    if (s) out[key] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

export function mapLeadToCrmPayload(lead: LeadData, ctx: CrmSyncContext) {
  return {
    name: lead.name || undefined,
    phone: lead.phone || undefined,
    company: ctx.businessName || undefined,
    message: lead.requirement || undefined,
    source_label: ctx.businessName || 'ai-receptionist',
    externalId: ctx.sessionId,
    extra: cleanExtra({
      budget: lead.budget,
      sentiment: lead.sentiment,
      leadScore: lead.leadScore,
      summary: lead.summary,
      appointmentStatus: lead.appointmentStatus,
    }),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mirrors a captured lead into the business owner's own CRM via their connected
 * webhook. Always non-blocking from the caller's perspective (fire-and-forget) -
 * retries/backoff happen here so callers never have to await this.
 */
export async function syncLeadToCrm(
  lead: LeadData,
  connection: CrmConnection,
  ctx: CrmSyncContext
): Promise<boolean> {
  try {
    if (!isCrmSyncEnabled(connection)) return false;

    const payload = mapLeadToCrmPayload(lead, ctx);
    if (!payload.name || !payload.phone) {
      console.warn(`[crm-sync] session ${ctx.sessionId} skipped — missing name or phone.`);
      return false;
    }

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Key': connection.api_key,
      'X-Idempotency-Key': ctx.sessionId,
    };
    if (connection.signing_secret) {
      headers['X-Signature'] =
        'sha256=' + crypto.createHmac('sha256', connection.signing_secret).update(body).digest('hex');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWithTimeout(
          connection.webhook_url,
          { method: 'POST', headers, body },
          REQUEST_TIMEOUT_MS
        );

        if (response.ok) {
          console.log(`[crm-sync] session ${ctx.sessionId} mirrored to CRM (status ${response.status}).`);
          return true;
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const text = await response.text().catch(() => '');
          console.error(`[crm-sync] session ${ctx.sessionId} rejected by CRM (status ${response.status}): ${text}`);
          return false;
        }

        lastError = new Error(`CRM responded ${response.status}`);
      } catch (err) {
        lastError = err;
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt - 1] || 1500));
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`[crm-sync] session ${ctx.sessionId} could not be mirrored after ${MAX_ATTEMPTS} attempts: ${message}`);
    return false;
  } catch (err: any) {
    console.error('[crm-sync] unexpected error:', err?.message);
    return false;
  }
}

export interface CrmTestResult {
  ok: boolean;
  status?: number;
  message: string;
}

/**
 * Sends a single harmless test lead through the connection right after the
 * owner pastes credentials, so a bad key/secret/URL is caught immediately
 * instead of failing silently on the next real lead. No retries - this is
 * an interactive check, not a background sync.
 */
export async function testCrmConnection(connection: CrmConnection, ctx: CrmSyncContext): Promise<CrmTestResult> {
  if (!isCrmSyncEnabled(connection)) {
    return { ok: false, message: 'Webhook URL and API key are required.' };
  }

  const payload = {
    name: 'Test Lead',
    phone: '0000000000',
    message: 'Connection test from AI Receptionist - safe to ignore or delete.',
    source_label: ctx.businessName || 'ai-receptionist',
    externalId: ctx.sessionId,
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': connection.api_key,
    'X-Idempotency-Key': ctx.sessionId,
  };
  if (connection.signing_secret) {
    headers['X-Signature'] =
      'sha256=' + crypto.createHmac('sha256', connection.signing_secret).update(body).digest('hex');
  }

  try {
    const response = await fetchWithTimeout(connection.webhook_url, { method: 'POST', headers, body }, REQUEST_TIMEOUT_MS);
    const text = await response.text().catch(() => '');
    if (response.ok) {
      return { ok: true, status: response.status, message: 'Test lead delivered successfully.' };
    }
    return { ok: false, status: response.status, message: text || `CRM responded with status ${response.status}.` };
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? 'Request timed out.' : (err?.message || 'Could not reach the webhook URL.');
    return { ok: false, message };
  }
}
