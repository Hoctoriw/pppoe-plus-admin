ALTER TABLE public.routers
  ADD COLUMN radius_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN radius_host text,
  ADD COLUMN radius_secret text,
  ADD COLUMN radius_auth_port integer NOT NULL DEFAULT 1812,
  ADD COLUMN radius_acct_port integer NOT NULL DEFAULT 1813;