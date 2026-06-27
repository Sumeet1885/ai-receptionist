-- 20260627140000_add_crm_connections.sql
-- Per-bot CRM webhook connections ("Connect CRM"), mirroring calendar_connections.
CREATE TABLE public.crm_connections (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    bot_id UUID NOT NULL UNIQUE REFERENCES public.bots(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    signing_secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their crm connections"
ON public.crm_connections
FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);
