CREATE TABLE public.radius_appliances (
  hostname text PRIMARY KEY,
  local_ip text,
  version text,
  radius_ok boolean NOT NULL DEFAULT false,
  uptime text,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.radius_appliances TO authenticated;
GRANT ALL ON public.radius_appliances TO service_role;
ALTER TABLE public.radius_appliances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admin reads appliances" ON public.radius_appliances FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));