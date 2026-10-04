CREATE OR REPLACE FUNCTION public.create_trial_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.licenses (user_id, expires_at, has_network) VALUES (NEW.id, now() + interval '15 days', true) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_trial_license() FROM public, anon, authenticated;