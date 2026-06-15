import { createClient } from '@supabase/supabase-js';

// These values will be replaced with real credentials from your Supabase project.
// Go to: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
