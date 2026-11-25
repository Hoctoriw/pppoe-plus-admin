CREATE TABLE public.prospect_automation (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 enabled boolean NOT NULL DEFAULT false,
 daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit BETWEEN 1 AND 100),
 uf text NOT NULL DEFAULT '' CHECK (uf = '' OR uf ~ '^[A-Z]{2}$'),
 last_run_day date,
 last_run_at timestamptz,
 last_sent integer NOT NULL DEFAULT 0,
 last_failed integer NOT NULL DEFAULT 0,
 last_error text
);
GRANT SELECT, INSERT, UPDATE ON public.prospect_automation TO authenticated;
GRANT ALL ON public.prospect_automation TO service_role;
ALTER TABLE public.prospect_automation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admin manages prospect automation" ON public.prospect_automation FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.prospects ADD COLUMN claimed_at timestamptz;
CREATE FUNCTION public.claim_prospect_automation() RETURNS SETOF public.prospect_automation LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE public.prospect_automation SET last_run_day = (now() AT TIME ZONE 'America/Sao_Paulo')::date, last_run_at = now(), last_sent = 0, last_failed = 0, last_error = 'Em andamento'
 WHERE id = 1 AND enabled AND last_run_day IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_prospect_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_prospect_automation() TO service_role;