CREATE TABLE public.license_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  days integer NOT NULL CHECK (days > 0),
  price numeric(10,2) NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.license_plans TO authenticated;
GRANT ALL ON public.license_plans TO service_role;
ALTER TABLE public.license_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read active license plans" ON public.license_plans FOR SELECT TO authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER set_license_plans_updated_at BEFORE UPDATE ON public.license_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.license_plans (name, days, price) VALUES ('Mensal', 30, 49.90), ('Anual', 365, 499.00);

CREATE TABLE public.license_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.license_plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  days integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  txid text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.license_payments TO authenticated;
GRANT ALL ON public.license_payments TO service_role;
ALTER TABLE public.license_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own license payments" ON public.license_payments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER set_license_payments_updated_at BEFORE UPDATE ON public.license_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();