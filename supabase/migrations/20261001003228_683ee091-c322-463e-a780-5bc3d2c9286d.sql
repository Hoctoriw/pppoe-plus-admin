ALTER TABLE public.license_plans ADD COLUMN IF NOT EXISTS includes_network boolean NOT NULL DEFAULT false;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS has_network boolean NOT NULL DEFAULT false;
ALTER TABLE public.license_payments ADD COLUMN IF NOT EXISTS includes_network boolean NOT NULL DEFAULT false;

-- Mantém acesso de quem já usa o módulo hoje
UPDATE public.licenses SET has_network = true WHERE expires_at > now();