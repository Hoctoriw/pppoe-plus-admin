CREATE TABLE public.olts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  vendor text NOT NULL DEFAULT 'vsol',
  model text,
  host text NOT NULL,
  snmp_community text NOT NULL DEFAULT 'public',
  snmp_port integer NOT NULL DEFAULT 161,
  pon_ports integer NOT NULL DEFAULT 8,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.olts TO authenticated;
GRANT ALL ON public.olts TO service_role;
ALTER TABLE public.olts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "olts owner" ON public.olts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER olts_updated BEFORE UPDATE ON public.olts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();