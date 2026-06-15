import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import calendarRoutes from './routes/calendar.routes';
import chatRoutes from './routes/chat.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/calendar', calendarRoutes);
app.use('/api/chat', chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global Error Handler
app.use(errorHandler);

import { setupWebSocketServer } from './controllers/liveChatController';

const server = app.listen(config.port, () => {
  console.log(`🧠 AI Receptionist Brain API running on http://localhost:${config.port}`);
});

// Attach WebSocket server for Gemini Live API Voice
setupWebSocketServer(server);
