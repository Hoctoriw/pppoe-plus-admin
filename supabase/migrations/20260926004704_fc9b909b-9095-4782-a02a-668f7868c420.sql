CREATE TABLE public.customer_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  equipment_type text NOT NULL,
  brand text,
  model text,
  serial_number text,
  mac_address text,
  delivered_at date,
  returned_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_equipment TO authenticated;
GRANT ALL ON public.customer_equipment TO service_role;
ALTER TABLE public.customer_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view equipment" ON public.customer_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create equipment" ON public.customer_equipment FOR INSERT TO authenticated WITH CHECK (public.can_manage_network());
CREATE POLICY "Managers update equipment" ON public.customer_equipment FOR UPDATE TO authenticated USING (public.can_manage_network()) WITH CHECK (public.can_manage_network());
CREATE POLICY "Managers delete equipment" ON public.customer_equipment FOR DELETE TO authenticated USING (public.can_manage_network());
CREATE INDEX ON public.customer_equipment(customer_id);
CREATE TRIGGER set_customer_equipment_updated_at BEFORE UPDATE ON public.customer_equipment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();