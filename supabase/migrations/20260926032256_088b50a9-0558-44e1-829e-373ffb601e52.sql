CREATE TABLE public.license_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key text,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','sandbox')),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.license_settings TO service_role;
ALTER TABLE public.license_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_license_settings_updated_at BEFORE UPDATE ON public.license_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.license_payments ADD COLUMN provider_charge_id text, ADD COLUMN pix_payload text;
CREATE UNIQUE INDEX license_payments_provider_charge_idx ON public.license_payments(provider_charge_id) WHERE provider_charge_id IS NOT NULL;