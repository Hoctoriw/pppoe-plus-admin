CREATE TABLE public.onprem_sync_tokens (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT ON public.onprem_sync_tokens TO authenticated;
GRANT ALL ON public.onprem_sync_tokens TO service_role;
ALTER TABLE public.onprem_sync_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own sync token" ON public.onprem_sync_tokens FOR SELECT TO authenticated USING (owner_id = auth.uid());