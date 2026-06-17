import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { wsTransport } from '../utils/wsTransport';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});
