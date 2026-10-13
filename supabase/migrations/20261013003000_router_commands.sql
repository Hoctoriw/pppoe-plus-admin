CREATE TABLE IF NOT EXISTS public.router_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  router_id uuid NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  body jsonb,
  status text NOT NULL DEFAULT 'pending',
  http_status int,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS router_commands_pending ON public.router_commands(status, created_at);
GRANT ALL ON public.router_commands TO service_role;
ALTER TABLE public.router_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS via_agent boolean NOT NULL DEFAULT false;
