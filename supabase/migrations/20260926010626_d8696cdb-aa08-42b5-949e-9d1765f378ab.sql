ALTER TABLE public.customers ADD COLUMN due_day integer CHECK (due_day BETWEEN 1 AND 28);

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_at date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','overdue','cancelled')),
  method text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (can_manage_network() AND created_by = auth.uid());
CREATE POLICY "Managers update invoices" ON public.invoices FOR UPDATE TO authenticated USING (can_manage_network()) WITH CHECK (can_manage_network());
CREATE POLICY "Admins delete invoices" ON public.invoices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();