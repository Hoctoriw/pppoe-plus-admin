ALTER TABLE public.radius_appliances ADD COLUMN IF NOT EXISTS owner_id uuid;
DROP POLICY IF EXISTS "Platform admin reads appliances" ON public.radius_appliances;
CREATE POLICY "Owner reads own appliances" ON public.radius_appliances FOR SELECT TO authenticated USING (owner_id = auth.uid());