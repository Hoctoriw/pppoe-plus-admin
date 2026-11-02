CREATE OR REPLACE FUNCTION public.can_export_network()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND can_export_network)
$$;

CREATE OR REPLACE FUNCTION public.set_team_export(_user_id uuid, _allowed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente o administrador pode liberar a exportação.'; END IF;
  UPDATE public.user_roles SET can_export_network = _allowed WHERE user_id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_export_users()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT user_id FROM public.user_roles
  WHERE can_export_network AND public.has_role(auth.uid(), 'admin')
$$;
REVOKE ALL ON FUNCTION public.admin_export_users() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_users() TO authenticated;