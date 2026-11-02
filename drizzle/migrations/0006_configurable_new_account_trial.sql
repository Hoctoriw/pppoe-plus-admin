ALTER TABLE public.app_settings ADD COLUMN trial_days integer NOT NULL DEFAULT 7 CONSTRAINT app_settings_trial_days_range CHECK (trial_days BETWEEN 0 AND 365);

CREATE OR REPLACE FUNCTION public.set_trial_days(_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas o administrador pode alterar o período de teste.';
  END IF;
  IF _days IS NULL OR _days < 0 OR _days > 365 THEN
    RAISE EXCEPTION 'Informe de 0 a 365 dias de teste.';
  END IF;
  INSERT INTO public.app_settings (id, trial_days, updated_at) VALUES (1, _days, now())
  ON CONFLICT (id) DO UPDATE SET trial_days = EXCLUDED.trial_days, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_trial_days(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_trial_days(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.new_trial_expires_at(_started_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _started_at + make_interval(days => COALESCE((SELECT trial_days FROM public.app_settings WHERE id = 1), 7));
$$;
REVOKE ALL ON FUNCTION public.new_trial_expires_at(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.new_trial_expires_at(timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_trial_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.licenses (user_id, expires_at, has_network)
  VALUES (NEW.id, public.new_trial_expires_at(now()), true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;