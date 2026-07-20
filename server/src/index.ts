import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import calendarRoutes from './routes/calendar.routes';
import chatRoutes from './routes/chat.routes';
import { geminiGuard } from './services/geminiGuard';
import { isTrustedCorsOrigin } from './utils/corsPolicy';

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

import widgetRoutes from './routes/widget.routes';
import crmRoutes from './routes/crm.routes';
import { dograhRoutes, phoneToolsRoutes, campaignRoutes, startCallPoller, startCampaign } from './modules/phone-calls';
import { supabase } from './services/db';

app.use('/api/calendar', calendarRoutes);
app.use('/api/chat', chatRoutes);
app.use('/widget', widgetRoutes);
app.use('/api/dograh', dograhRoutes);
app.use('/api/phone-tools', phoneToolsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/campaigns', campaignRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiGuard: geminiGuard.getStatus()
  });
});

app.use(errorHandler);

import { setupWebSocketServer } from './controllers/liveChatController';

const server = app.listen(config.port, () => {
  console.log(`🧠 AI Receptionist Brain API running on http://localhost:${config.port}`);
});

setupWebSocketServer(server);

startCallPoller(supabase);


async function resumeRunningCampaigns(): Promise<void> {
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

void resumeRunningCampaigns();
