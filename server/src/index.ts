import dotenv from 'dotenv';
dotenv.config(); // Load .env first — acts as fallback values before SSM overwrites

import { loadSecrets } from './utils/loadSecrets';

/**
 * Bootstrap the server.
 *
 * Execution order is critical:
 *   1. dotenv.config()  → populates process.env from .env (fallback values)
 *   2. loadSecrets()    → overwrites SSM-managed keys with live values from AWS SSM
 *   3. dynamic import of config → config.ts reads the now-final process.env
 *   4. Express + WebSocket + background services start up
 *
 * All module imports below are intentionally lazy (dynamic import) so that
 * no module that reads process.env at evaluation time runs before Step 2.
 */
async function bootstrap(): Promise<void> {
  // ── 1. Pull secrets from SSM (overwrites .env fallbacks for managed keys) ──
  await loadSecrets();

  // ── 2. Lazy-import config AFTER env is fully populated ──
  const { config } = await import('./config');

  // ── 3. Lazy-import all other server modules ──
  const express        = (await import('express')).default;
  const cors           = (await import('cors')).default;
  const { errorHandler }       = await import('./middleware/errorHandler');
  const calendarRoutes         = (await import('./routes/calendar.routes')).default;
  const chatRoutes             = (await import('./routes/chat.routes')).default;
  const { geminiGuard }        = await import('./services/geminiGuard');
  const { isTrustedCorsOrigin }= await import('./utils/corsPolicy');
  const widgetRoutes           = (await import('./routes/widget.routes')).default;
  const crmRoutes              = (await import('./routes/crm.routes')).default;
  const { dograhRoutes, phoneToolsRoutes, campaignRoutes, startCallPoller, startCampaign } =
    await import('./modules/phone-calls');
  const { supabase }           = await import('./services/db');
  const { setupWebSocketServer }= await import('./controllers/liveChatController');

  // ── 4. Express app setup ──
  const app = express();
  app.set('trust proxy', 1);

  const trustedCorsOrigins = [
    config.clientUrl,
    process.env.WIDGET_BASE_URL,
    process.env.EXPRESS_SERVER_URL,
  ].filter((origin): origin is string => Boolean(origin));

  app.use(cors({
    origin(origin, callback) {
      callback(null, isTrustedCorsOrigin(origin, trustedCorsOrigins));
    },
  }));
  app.use(express.json());

  // ── 5. Routes ──
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/chat',     chatRoutes);
  app.use('/widget',       widgetRoutes);
  app.use('/api/dograh',   dograhRoutes);
  app.use('/api/phone-tools', phoneToolsRoutes);
  app.use('/api/crm',      crmRoutes);
  app.use('/api/campaigns', campaignRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', geminiGuard: geminiGuard.getStatus() });
  });

  app.use(errorHandler);

  // ── 6. Start HTTP + WebSocket servers ──
  const server = app.listen(config.port, () => {
    console.log(`🧠 AI Receptionist Brain API running on http://localhost:${config.port}`);
  });

  setupWebSocketServer(server);

  // ── 7. Background services ──
  startCallPoller(supabase);
  await resumeRunningCampaigns(supabase, startCampaign);
}

// ---------------------------------------------------------------------------
// Resume campaigns that were running before this server instance started
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resumeRunningCampaigns(
  supabase: any,
  startCampaign: (...args: any[]) => void,
): Promise<void> {
  const { data: campaigns, error } = await supabase
    .from('call_campaigns')
    .select('id, hourly_cap_override, bot_id')
    .in('status', ['running', 'paused']);

  if (error) {
    console.error('[startup] Failed to query running campaigns:', error.message);
    return;
  }

  if (!campaigns?.length) {
    console.log('[startup] No orphaned campaigns to resume.');
    return;
  }

  console.log(`[startup] Resuming ${campaigns.length} orphaned campaign(s)...`);

  for (const campaign of campaigns) {
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('id', campaign.bot_id)
      .single();

    if (botError || !bot) {
      console.warn(`[startup] Could not load bot for campaign ${campaign.id} — skipping.`);
      continue;
    }

    await supabase
      .from('call_campaigns')
      .update({ status: 'running' })
      .eq('id', campaign.id);

    startCampaign(campaign.id, bot, campaign.hourly_cap_override, supabase);
    console.log(`[startup] Resumed campaign ${campaign.id}.`);
  }
}

void bootstrap();
