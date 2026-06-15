-- 003_unique_calendar_connection.sql
-- Add unique constraint to calendar_connections to support upsert by owner_id
ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS unique_owner_calendar;
ALTER TABLE public.calendar_connections ADD CONSTRAINT unique_owner_calendar UNIQUE (owner_id, provider);
