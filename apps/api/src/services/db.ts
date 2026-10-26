import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { wsTransport } from '../utils/wsTransport';

// The only service-role client in the codebase (enforced by scripts/check-boundaries.mjs).
// It bypasses RLS, so every query must scope by owner/bot explicitly.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});
