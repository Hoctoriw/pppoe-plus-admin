CREATE TABLE public.routers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  dhcp_server text,
  active boolean NOT NULL DEFAULT true,
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage routers" ON public.routers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER routers_updated_at BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE VIEW public.routers_public WITH (security_invoker = false) AS
  SELECT id, name, active, last_check_at, last_check_ok FROM public.routers;
REVOKE ALL ON public.routers_public FROM anon;
GRANT SELECT ON public.routers_public TO authenticated;

ALTER TABLE public.customers
  ADD COLUMN router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  ADD COLUMN sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN last_sync_at timestamptz,
  ADD COLUMN sync_error text;
CREATE INDEX customers_router_idx ON public.customers(router_id);