import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import WebSocket from 'ws';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: WebSocket },
});
