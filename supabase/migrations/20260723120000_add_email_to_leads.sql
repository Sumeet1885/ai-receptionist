-- Add email column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email TEXT;
