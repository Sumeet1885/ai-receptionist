import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import calendarRoutes from './routes/calendar.routes';
import chatRoutes from './routes/chat.routes';
import { geminiGuard } from './services/geminiGuard';

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

import widgetRoutes from './routes/widget.routes';

// Routes
app.use('/api/calendar', calendarRoutes);
app.use('/api/chat', chatRoutes);
app.use('/widget', widgetRoutes);

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
