-- ============================================================
-- AI Receptionist — Add phone_number column to bots table
-- Migration: 20261008120000_add_bot_phone_number.sql
-- ============================================================

ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

NOTIFY pgrst, 'reload schema';
