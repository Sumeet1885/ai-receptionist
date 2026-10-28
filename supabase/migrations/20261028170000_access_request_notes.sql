-- Append-only, private admin notes. Existing notes remain available as an imported entry.
CREATE TABLE public.access_request_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_request_id uuid NOT NULL REFERENCES public.access_requests(id) ON DELETE CASCADE,
  author_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  is_imported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_request_note_length CHECK (is_imported OR length(body) <= 2000)
);
CREATE INDEX access_request_notes_request_date_idx
  ON public.access_request_notes(access_request_id, created_at DESC, id DESC);
ALTER TABLE public.access_request_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_request_notes FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.access_request_notes TO service_role;

-- The previous model did not retain the note author or exact creation time. Do not guess either:
-- flag the import, leave its author empty and use the request's last update as its recorded date.
INSERT INTO public.access_request_notes(access_request_id, body, is_imported, created_at)
SELECT id, admin_notes, true, updated_at FROM public.access_requests
WHERE admin_notes IS NOT NULL AND length(btrim(admin_notes)) > 0;

NOTIFY pgrst, 'reload schema';
