DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans','customers','routers','bank_accounts','invoices','customer_equipment'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN owner_id uuid DEFAULT auth.uid()', t);
    EXECUTE format('UPDATE public.%I SET owner_id = %L WHERE owner_id IS NULL', t, '3deadf2d-6c85-45f0-a81f-0bb0c124d679');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN owner_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(owner_id)', t || '_owner_idx', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins delete plans" ON public.plans;
DROP POLICY IF EXISTS "Managers create plans" ON public.plans;
DROP POLICY IF EXISTS "Managers update plans" ON public.plans;
DROP POLICY IF EXISTS "Staff view plans" ON public.plans;
DROP POLICY IF EXISTS "Admins delete customers" ON public.customers;
DROP POLICY IF EXISTS "Managers create customers" ON public.customers;
DROP POLICY IF EXISTS "Managers update customers" ON public.customers;
DROP POLICY IF EXISTS "Staff view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins manage routers" ON public.routers;
DROP POLICY IF EXISTS "Admins manage bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Managers create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Managers update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Staff view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Managers create equipment" ON public.customer_equipment;
DROP POLICY IF EXISTS "Managers delete equipment" ON public.customer_equipment;
DROP POLICY IF EXISTS "Managers update equipment" ON public.customer_equipment;
DROP POLICY IF EXISTS "Staff view equipment" ON public.customer_equipment;

CREATE POLICY "Owner manages plans" ON public.plans FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner manages routers" ON public.routers FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner manages bank accounts" ON public.bank_accounts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner manages customers" ON public.customers FOR ALL TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid()
    AND (plan_id IS NULL OR EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.owner_id = auth.uid()))
    AND (router_id IS NULL OR EXISTS (SELECT 1 FROM public.routers r WHERE r.id = router_id AND r.owner_id = auth.uid())));
CREATE POLICY "Owner manages invoices" ON public.invoices FOR ALL TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.owner_id = auth.uid()));
CREATE POLICY "Owner manages equipment" ON public.customer_equipment FOR ALL TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.owner_id = auth.uid()));