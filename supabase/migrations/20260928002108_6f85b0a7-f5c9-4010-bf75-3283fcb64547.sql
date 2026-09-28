CREATE TABLE public.ftth_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  node_type text NOT NULL CHECK (node_type IN ('olt','ceo','cto')),
  name text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  parent_id uuid REFERENCES public.ftth_nodes(id) ON DELETE SET NULL,
  pon_port integer,
  tx_power_dbm numeric NOT NULL DEFAULT 5,
  splitter_ratio integer NOT NULL DEFAULT 1 CHECK (splitter_ratio IN (1,2,4,8,16,32,64)),
  fusion_count integer NOT NULL DEFAULT 0 CHECK (fusion_count >= 0),
  connector_count integer NOT NULL DEFAULT 0 CHECK (connector_count >= 0),
  ports integer NOT NULL DEFAULT 0 CHECK (ports >= 0),
  cable_fibers integer,
  cable_length_m numeric CHECK (cable_length_m IS NULL OR cable_length_m >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ftth_nodes TO authenticated;
GRANT ALL ON public.ftth_nodes TO service_role;
ALTER TABLE public.ftth_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner and team manage ftth nodes" ON public.ftth_nodes FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));
CREATE TRIGGER set_ftth_nodes_updated_at BEFORE UPDATE ON public.ftth_nodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ftth_nodes_owner_idx ON public.ftth_nodes(owner_id);

ALTER TABLE public.customers
  ADD COLUMN cto_id uuid REFERENCES public.ftth_nodes(id) ON DELETE SET NULL,
  ADD COLUMN cto_port integer CHECK (cto_port IS NULL OR cto_port > 0);
CREATE UNIQUE INDEX customers_cto_port_unique ON public.customers(cto_id, cto_port) WHERE cto_id IS NOT NULL AND cto_port IS NOT NULL;