ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS has_speedtest boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.my_license()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _owner uuid; _lu uuid; _exp timestamptz; _net boolean; _sp boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',true,'expires_at',null,'network',true,'speedtest',true); END IF;
  SELECT owner_id INTO _owner FROM public.user_roles WHERE user_id = auth.uid() AND owner_id IS NOT NULL LIMIT 1;
  IF _owner IS NOT NULL AND public.has_role(_owner, 'admin') THEN RETURN jsonb_build_object('valid',true,'admin',false,'expires_at',null,'network',true,'speedtest',true); END IF;
  _lu := COALESCE(_owner, auth.uid());
  SELECT expires_at, has_network, has_speedtest INTO _exp, _net, _sp FROM public.licenses WHERE user_id = _lu;
  RETURN jsonb_build_object('valid', _exp IS NOT NULL AND _exp > now(), 'admin', false, 'expires_at', _exp,
    'network', _exp IS NOT NULL AND _exp > now() AND COALESCE(_net,false),
    'speedtest', _exp IS NOT NULL AND _exp > now() AND COALESCE(_sp,false));
END $function$;