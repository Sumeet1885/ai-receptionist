-- Support data is API-only. The service role enforces ticket ownership and admin permissions.
CREATE TABLE public.support_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  categories jsonb NOT NULL DEFAULT '[]',
  retention_days integer NOT NULL DEFAULT 0 CHECK (retention_days BETWEEN 0 AND 3650)
);
INSERT INTO public.support_settings (id) VALUES (true);
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 254),
  email text NOT NULL CHECK (length(email) <= 254),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 25),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 150),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 50),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting_reply','resolved','closed')),
  assigned_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_unread boolean NOT NULL DEFAULT true,
  guest_token_hash text UNIQUE,
  guest_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id, updated_at DESC);
CREATE INDEX support_tickets_triage_idx ON public.support_tickets(status, updated_at DESC);
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer','admin')),
  sender_name text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_internal OR sender_type = 'admin')
);
CREATE INDEX support_messages_ticket_idx ON public.support_messages(ticket_id, created_at);
CREATE TABLE public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 10485760)
);
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_settings, public.support_tickets, public.support_messages, public.support_attachments FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.support_tickets_ticket_number_seq FROM anon, authenticated;
GRANT ALL ON public.support_settings, public.support_tickets, public.support_messages, public.support_attachments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_tickets_ticket_number_seq TO service_role;
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('support-attachments','support-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Ticket + first message + attachment records commit together after private uploads succeed.
CREATE FUNCTION public.create_support_ticket(p_ticket jsonb, p_body text, p_files jsonb DEFAULT '[]')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ticket_id uuid; message_id uuid;
BEGIN
  INSERT INTO support_tickets(user_id,name,email,phone,subject,category,priority,guest_token_hash,guest_expires_at)
  VALUES ((p_ticket->>'user_id')::uuid,p_ticket->>'name',p_ticket->>'email',coalesce(p_ticket->>'phone',''),p_ticket->>'subject',p_ticket->>'category',p_ticket->>'priority',p_ticket->>'guest_token_hash',(p_ticket->>'guest_expires_at')::timestamptz)
  RETURNING id INTO ticket_id;
  INSERT INTO support_messages(ticket_id,sender_type,sender_name,body) VALUES(ticket_id,'customer',p_ticket->>'name',p_body) RETURNING id INTO message_id;
  INSERT INTO support_attachments(message_id,storage_key,file_name,content_type,file_size)
  SELECT message_id,f->>'storage_key',f->>'file_name',f->>'content_type',(f->>'file_size')::integer FROM jsonb_array_elements(p_files) f;
  RETURN ticket_id;
END $$;
CREATE FUNCTION public.reply_support_ticket(p_id uuid, p_body text, p_sender text, p_name text, p_internal boolean, p_files jsonb DEFAULT '[]')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE message_id uuid;
BEGIN
  PERFORM id FROM support_tickets WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  INSERT INTO support_messages(ticket_id,sender_type,sender_name,body,is_internal)
  VALUES(p_id,p_sender,p_name,p_body,p_internal) RETURNING id INTO message_id;
  INSERT INTO support_attachments(message_id,storage_key,file_name,content_type,file_size)
  SELECT message_id,f->>'storage_key',f->>'file_name',f->>'content_type',(f->>'file_size')::integer FROM jsonb_array_elements(p_files) f;
  UPDATE support_tickets SET updated_at=now(),admin_unread=(p_sender='customer' OR admin_unread),
    status=CASE WHEN p_internal THEN status WHEN p_sender='admin' THEN 'awaiting_reply' WHEN status='in_progress' THEN status ELSE 'open' END WHERE id=p_id;
  RETURN message_id;
END $$;
REVOKE ALL ON FUNCTION public.create_support_ticket(jsonb,text,jsonb), public.reply_support_ticket(uuid,text,text,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(jsonb,text,jsonb), public.reply_support_ticket(uuid,text,text,text,boolean,jsonb) TO service_role;

-- Durable cleanup queue: a storage outage must not leave untracked attachment objects.
CREATE TABLE public.support_storage_cleanup (
  storage_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_storage_cleanup FROM anon, authenticated;
GRANT ALL ON public.support_storage_cleanup TO service_role;
CREATE FUNCTION public.purge_finished_support(p_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ticket record; deleted_count integer := 0;
BEGIN
  FOR ticket IN SELECT id FROM support_tickets WHERE status IN ('resolved','closed') AND updated_at < p_cutoff LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO support_storage_cleanup(storage_key)
    SELECT a.storage_key FROM support_attachments a JOIN support_messages m ON m.id=a.message_id WHERE m.ticket_id=ticket.id
    ON CONFLICT DO NOTHING;
    DELETE FROM support_tickets WHERE id=ticket.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_finished_support(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_finished_support(timestamptz) TO service_role;
