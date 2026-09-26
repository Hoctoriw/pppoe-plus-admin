ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.has_team_access(_user_id uuid, _owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND owner_id = _owner_id)
$$;

-- plans
DROP POLICY IF EXISTS "Owner manages plans" ON public.plans;
CREATE POLICY "Owner and team manage plans" ON public.plans FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));

-- routers
DROP POLICY IF EXISTS "Owner manages routers" ON public.routers;
CREATE POLICY "Owner and team manage routers" ON public.routers FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));

-- bank_accounts
DROP POLICY IF EXISTS "Owner manages bank accounts" ON public.bank_accounts;
CREATE POLICY "Owner and team manage bank accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));

-- customers
DROP POLICY IF EXISTS "Owner manages customers" ON public.customers;
CREATE POLICY "Owner and team manage customers" ON public.customers FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));

-- invoices
DROP POLICY IF EXISTS "Owner manages invoices" ON public.invoices;
CREATE POLICY "Owner and team manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));

-- customer_equipment
DROP POLICY IF EXISTS "Owner manages equipment" ON public.customer_equipment;
CREATE POLICY "Owner and team manage equipment" ON public.customer_equipment FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id))
  WITH CHECK (owner_id = auth.uid() OR public.has_team_access(auth.uid(), owner_id));