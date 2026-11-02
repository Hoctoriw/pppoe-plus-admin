DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
REVOKE ALL ON public.app_settings FROM anon;
GRANT SELECT ON public.app_settings TO authenticated;
CREATE POLICY "Signed-in users can read app settings" ON public.app_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);