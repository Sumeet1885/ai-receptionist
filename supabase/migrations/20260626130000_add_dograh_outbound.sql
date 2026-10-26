-- ============================================================
-- AI Receptionist — Outbound phone calls via Dograh
-- Migration: 20260626130000_add_dograh_outbound.sql
-- ============================================================

-- Dograh fixes a workflow's call_type (inbound/outbound) at creation, so outbound calling
-- needs its own provisioned workflow per bot, separate from the inbound one.
ALTER TABLE bots
  ADD COLUMN dograh_outbound_workflow_id TEXT;

NOTIFY pgrst, 'reload schema';
