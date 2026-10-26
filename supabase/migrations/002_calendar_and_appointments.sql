-- 002_calendar_and_appointments.sql
-- Calendar Connections (OAuth Tokens)
CREATE TABLE public.calendar_connections (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    calendar_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their calendar connections" 
ON public.calendar_connections
FOR ALL 
USING (auth.uid() = owner_id);

-- Appointments
CREATE TABLE public.appointments (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    visitor_name TEXT,
    visitor_phone TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    calendar_event_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their appointments" 
ON public.appointments
FOR ALL 
USING (
    bot_id IN (
        SELECT id FROM public.bots WHERE owner_id = auth.uid()
    )
);
