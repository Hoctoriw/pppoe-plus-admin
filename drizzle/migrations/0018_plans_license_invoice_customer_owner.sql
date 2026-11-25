CREATE POLICY "Plans require active license" ON public.plans AS RESTRICTIVE FOR ALL TO authenticated
USING (COALESCE((public.my_license()->>'valid')::boolean, false))
WITH CHECK (COALESCE((public.my_license()->>'valid')::boolean, false));

CREATE OR REPLACE FUNCTION public.validate_invoice_customer_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.customer_id AND owner_id = NEW.owner_id) THEN
  RAISE EXCEPTION 'Cliente não encontrado nesta conta.' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_invoice_customer_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invoice_customer_same_owner BEFORE INSERT OR UPDATE OF customer_id, owner_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_customer_owner();