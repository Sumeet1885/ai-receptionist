import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/** Guards the /api/phone-tools/* endpoints Dograh's backend calls back into mid-call. There is
 * no Supabase session here (the caller is Dograh's container, not a browser), so this checks a
 * shared secret instead - same X-API-Key convention Dograh's own public agent triggers use. */
export function requirePhoneToolsApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.phoneTools.apiKey) {
    res.status(503).json({ error: 'Phone tools are not configured (PHONE_TOOLS_API_KEY missing).' });
    return;
  }
  // Header for the http_api tools (check_availability/book_appointment, which support static
  // headers); query param for pre_call_fetch, whose schema only offers a credential_uuid for
  // auth and we don't want to require the owner to manually create a Dograh credential for this.
  const presented = req.header('X-API-Key') || req.query.key;
  if (presented !== config.phoneTools.apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
}
