ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS allowed_domains text[] DEFAULT '{}';
NOTIFY pgrst, 'reload schema';
