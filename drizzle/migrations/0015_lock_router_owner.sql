CREATE OR REPLACE FUNCTION public.prevent_router_owner_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'owner_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS routers_owner_immutable ON public.routers;
CREATE TRIGGER routers_owner_immutable BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.prevent_router_owner_change();