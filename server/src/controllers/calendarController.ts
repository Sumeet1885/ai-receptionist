import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { wsTransport } from '../utils/wsTransport';
import { getCalendarAdapter } from '../services/calendar/calendarAdapterFactory';
import { consumeCalendarOAuthState, createCalendarOAuthState } from '../services/calendar/oauthState';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});

export const getAuthUrl = async (req: any, res: Response) => {
  const provider = req.query.provider as string;
  const ownerId = req.user.id; // from auth middleware

  try {
    const adapter = getCalendarAdapter(provider);
    const state = await createCalendarOAuthState({ db: supabase, ownerId, provider });
    const url = adapter.getAuthUrl(state);
    res.json({ url });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

export const handleCallback = async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const code = req.query.code as string;
  const state = req.query.state as string;

  try {
    if (!code) throw new Error('OAuth authorization code is missing');
    const ownerId = await consumeCalendarOAuthState({ db: supabase, state, provider });
    const adapter = getCalendarAdapter(provider);
    await adapter.handleCallback(code, ownerId);
    // Redirect back to dashboard appointments tab
    res.redirect(`${config.clientUrl}/dashboard?tab=appointments`);
  } catch (err: any) {
    console.error(`Callback error [${provider}]:`, err);
    res.redirect(`${config.clientUrl}/dashboard?tab=appointments&error=auth_failed`);
  }
};

export const getStatus = async (req: any, res: Response) => {
  const ownerId = req.user.id;
  try {
    const { data } = await supabase
      .from('calendar_connections')
      .select('id, provider')
      .eq('owner_id', ownerId)
      .maybeSingle();
      
    res.json({ connected: !!data, provider: data?.provider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
