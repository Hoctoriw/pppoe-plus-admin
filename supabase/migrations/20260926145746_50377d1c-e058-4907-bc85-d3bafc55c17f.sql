CREATE TABLE public.backup_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  email text NOT NULL,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages backup settings" ON public.backup_settings FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER set_backup_settings_updated_at BEFORE UPDATE ON public.backup_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();