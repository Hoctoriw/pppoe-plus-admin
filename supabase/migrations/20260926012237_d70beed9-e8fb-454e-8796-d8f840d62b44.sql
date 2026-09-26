CREATE TABLE public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  bank_code text,
  agency text,
  agency_digit text,
  account_number text,
  account_digit text,
  wallet text,
  convenio text,
  provider text NOT NULL DEFAULT 'asaas' CHECK (provider IN ('asaas','inter','sicoob','sicredi','manual')),
  api_key text,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','sandbox')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bank accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER set_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.invoices
  ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN nosso_numero text,
  ADD COLUMN linha_digitavel text,
  ADD COLUMN barcode text,
  ADD COLUMN boleto_url text,
  ADD COLUMN provider_charge_id text,
  ADD COLUMN boleto_status text NOT NULL DEFAULT 'none' CHECK (boleto_status IN ('none','pending','issued','paid','cancelled','error'));