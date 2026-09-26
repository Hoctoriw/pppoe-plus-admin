CREATE TABLE public.licenses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own license" ON public.licenses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER set_licenses_updated_at BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.licenses (user_id, expires_at)
SELECT id, created_at + interval '30 days' FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_trial_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.licenses (user_id, expires_at) VALUES (NEW.id, now() + interval '30 days') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_trial_license() FROM public, anon, authenticated;
CREATE TRIGGER on_auth_user_created_license AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_trial_license();