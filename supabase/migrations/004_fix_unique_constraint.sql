-- 004_fix_unique_constraint.sql
ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS unique_owner_calendar;
ALTER TABLE public.calendar_connections ADD CONSTRAINT unique_owner_calendar UNIQUE (owner_id, provider);
