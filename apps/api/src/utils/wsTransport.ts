import type { WebSocketLikeConstructor } from '@supabase/realtime-js';
import WebSocket from 'ws';

export const wsTransport = WebSocket as unknown as WebSocketLikeConstructor;
