import dotenv from 'dotenv';
dotenv.config();

// Imported directly (not via ./aws): it must run before ./config, which requires the secrets.
import { loadSecrets } from './aws/ssmSecrets';

async function bootstrap(): Promise<void> {
  await loadSecrets();

  const { config } = await import('./config');

  const express        = (await import('express')).default;
  const cors           = (await import('cors')).default;
  const { errorHandler }       = await import('./middleware/errorHandler');
  const calendarRoutes         = (await import('./routes/calendar.routes')).default;
  const chatRoutes             = (await import('./routes/chat.routes')).default;
  const { geminiGuard }        = await import('./services/geminiGuard');
  const { isTrustedCorsOrigin }= await import('./utils/corsPolicy');
  const widgetRoutes           = (await import('./routes/widget.routes')).default;
  const crmRoutes              = (await import('./routes/crm.routes')).default;
  const { adminAuthRoutes, createAdminEventsServer } = await import('./modules/admin-auth');
  const { accessRequestPublicRoutes, accessRequestAdminRoutes } = await import('./modules/access-requests');
  const { accountRoutes, accountPublicRoutes } = await import('./modules/accounts');
  const { billingPublicRoutes, billingAdminRoutes, razorpayWebhook, startCheckoutReminders } = await import('./modules/billing');
  const { notificationAdminRoutes } = await import('./modules/notifications');
  const { customerAdminRoutes } = await import('./modules/customers');
  const { routeUpgrades }      = await import('./utils/upgradeRouter');
  const { dograhRoutes, phoneToolsRoutes, campaignRoutes, startCallPoller, startCampaign } =
    await import('./modules/phone-calls');
  const { supabase }           = await import('./services/db');
  const { setupWebSocketServer }= await import('./controllers/liveChatController');
  const { requestLogger }      = await import('./middleware/requestLogger');
  const { logger }             = await import('./services/cloudwatchLogger');

  const app = express();
  app.set('trust proxy', 1);
  app.use(requestLogger);

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
  // Raw body: the Razorpay signature covers the exact bytes, so this route precedes express.json.
  app.post('/api/public/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);
  app.use(express.json());

  app.use('/api/calendar', calendarRoutes);
  app.use('/api/chat',     chatRoutes);
  app.use('/widget',       widgetRoutes);
  app.use('/api/dograh',   dograhRoutes);
  app.use('/api/phone-tools', phoneToolsRoutes);
  app.use('/api/crm',      crmRoutes);
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/admin',    adminAuthRoutes);
  app.use('/api/admin/access-requests', accessRequestAdminRoutes);
  app.use('/api/public',   accessRequestPublicRoutes);
  app.use('/api/public',   accountPublicRoutes);
  app.use('/api/public',   billingPublicRoutes);
  app.use('/api/admin/billing', billingAdminRoutes);
  app.use('/api/admin/notifications', notificationAdminRoutes);
  app.use('/api/admin/customers', customerAdminRoutes);
  app.use('/api/account',  accountRoutes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', geminiGuard: geminiGuard.getStatus() });
  });

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'ai-receptionist-server' });
  });

  app.use(errorHandler);

  const server = app.listen(config.port, () => {
    console.log(`🧠 AI Receptionist Brain API running on http://localhost:${config.port}`);
  });

  logger.info(`AI Receptionist Brain API running on port ${config.port}`, {
    port: config.port,
    nodeEnv: process.env.NODE_ENV,
    pid: process.pid,
  });

  process.on('SIGINT', async () => {
    await logger.flush();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await logger.flush();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason: any) => {
    const errMsg = reason?.message || (typeof reason === 'object' ? JSON.stringify(reason) : String(reason));
    console.error('[process] Unhandled Promise Rejection prevented crash:', errMsg);
    logger.error('Unhandled Promise Rejection', {
      error: errMsg,
      stack: reason?.stack,
    });
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('[process] Uncaught Exception prevented crash:', err.message);
    logger.error('Uncaught Exception', {
      error: err.message,
      stack: err.stack,
    });
  });

  routeUpgrades(server, {
    '/api/chat/live': setupWebSocketServer(),
    '/api/admin/events': createAdminEventsServer(),
  });

  startCallPoller(supabase);
  startCheckoutReminders();
  await resumeRunningCampaigns(supabase, startCampaign);
}

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
