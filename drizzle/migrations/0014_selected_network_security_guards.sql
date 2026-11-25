CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT (
   _user_id = auth.uid()
   OR auth.role() = 'service_role'
   OR EXISTS (SELECT 1 FROM public.user_roles caller WHERE caller.user_id = auth.uid() AND caller.role = 'admin')
 ) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_license()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _owner uuid; _lu uuid; _exp timestamptz; _net boolean; _sp boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
 IF public.has_role(auth.uid(), 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',true,'expires_at',null,'network',true,'speedtest',true); END IF;
 SELECT owner_id INTO _owner FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL LIMIT 1;
 IF _owner IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _owner AND role = 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',false,'expires_at',null,'network',true,'speedtest',true); END IF;
 _lu := COALESCE(_owner, auth.uid());
 SELECT expires_at, has_network, has_speedtest INTO _exp, _net, _sp FROM public.licenses WHERE user_id = _lu;
 RETURN jsonb_build_object('valid', _exp IS NOT NULL AND _exp > now(), 'admin', false, 'expires_at', _exp,
 'network', _exp IS NOT NULL AND _exp > now() AND COALESCE(_net,false),
 'speedtest', _exp IS NOT NULL AND _exp > now() AND COALESCE(_sp,false));
END $$;

CREATE POLICY "FTTH requires active network entitlement" ON public.ftth_nodes AS RESTRICTIVE FOR ALL TO authenticated
USING (COALESCE((public.my_license()->>'network')::boolean, false))
WITH CHECK (COALESCE((public.my_license()->>'network')::boolean, false));

CREATE OR REPLACE FUNCTION public.validate_customer_plan_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NEW.plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plans WHERE id = NEW.plan_id AND owner_id = NEW.owner_id) THEN
  RAISE EXCEPTION 'Plano não encontrado nesta conta.' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_customer_plan_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_plan_same_owner BEFORE INSERT OR UPDATE OF plan_id, owner_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.validate_customer_plan_owner();