CREATE TABLE public.radius_pairings (
  code text PRIMARY KEY,
  poll_hash text NOT NULL,
  hostname text NOT NULL,
  local_ip text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','delivered')),
  issued_token text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.radius_pairings TO service_role;
ALTER TABLE public.radius_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radius_appliances ADD COLUMN IF NOT EXISTS token_hash text UNIQUE;