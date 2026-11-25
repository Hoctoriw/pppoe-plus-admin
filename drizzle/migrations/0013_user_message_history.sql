CREATE TABLE public.user_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL,
 recipient_id uuid NOT NULL,
 recipient_email text NOT NULL,
 recipient_name text NOT NULL DEFAULT '',
 subject text NOT NULL,
 body text NOT NULL,
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed','unknown')),
 provider_message_id text,
 error text,
 parent_id uuid REFERENCES public.user_messages(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_messages TO authenticated;
GRANT ALL ON public.user_messages TO service_role;
ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admin reads message history" ON public.user_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX user_messages_recipient_created_idx ON public.user_messages (recipient_id, created_at DESC);
