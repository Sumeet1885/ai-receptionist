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
import { dograhRoutes, phoneToolsRoutes, campaignRoutes, startCallPoller } from './modules/phone-calls';
import { supabase } from './services/db';

// Routes
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

// Global Error Handler
app.use(errorHandler);

import { setupWebSocketServer } from './controllers/liveChatController';

const server = app.listen(config.port, () => {
  console.log(`🧠 AI Receptionist Brain API running on http://localhost:${config.port}`);
});

// Attach WebSocket server for Gemini Live API Voice
setupWebSocketServer(server);

// Start the Dograh phone-call poller (no-ops when DOGRAH_* env is unset)
startCallPoller(supabase);
