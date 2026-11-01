CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, full_name text, email text, active boolean, created_at timestamptz, roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem gerenciar usuários.'; END IF;
  RETURN QUERY SELECT p.id, p.full_name, COALESCE(u.email,'')::text, p.active, p.created_at,
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), '{}')
  FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id ORDER BY p.full_name;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_license()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _lu uuid; _exp timestamptz; _net boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',true,'expires_at',null,'network',true); END IF;
  SELECT owner_id INTO _owner FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL LIMIT 1;
  IF _owner IS NOT NULL AND public.has_role(_owner, 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',false,'expires_at',null,'network',true); END IF;
  _lu := COALESCE(_owner, auth.uid());
  SELECT expires_at, has_network INTO _exp, _net FROM public.licenses WHERE user_id = _lu;
  RETURN jsonb_build_object('valid', _exp IS NOT NULL AND _exp > now(), 'admin', false, 'expires_at', _exp,
    'network', _exp IS NOT NULL AND _exp > now() AND COALESCE(_net,false));
END $$;
REVOKE ALL ON FUNCTION public.my_license() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_license() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_support_email(_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas o administrador pode alterar o e-mail de suporte.'; END IF;
  INSERT INTO public.app_settings(id, support_email, updated_at) VALUES (1, _email, now())
  ON CONFLICT (id) DO UPDATE SET support_email = EXCLUDED.support_email, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_support_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_support_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_export_network()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL AND can_export_network)
$$;
REVOKE ALL ON FUNCTION public.can_export_network() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_export_network() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_team_export(_user_id uuid, _allowed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Funcionários não podem alterar permissões.'; END IF;
  UPDATE public.user_roles SET can_export_network = _allowed WHERE user_id = _user_id AND owner_id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.set_team_export(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_team_export(uuid, boolean) TO authenticated;