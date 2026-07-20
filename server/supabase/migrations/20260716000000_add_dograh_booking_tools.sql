-- ============================================================
-- AI Receptionist — Dograh calendar booking tools
-- Migration: 20260716000000_add_dograh_booking_tools.sql
-- ============================================================

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS dograh_check_availability_tool_uuid TEXT,
  ADD COLUMN IF NOT EXISTS dograh_book_appointment_tool_uuid TEXT;

NOTIFY pgrst, 'reload schema';
