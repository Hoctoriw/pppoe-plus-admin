ALTER TABLE public.radius_appliances ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.radius_appliances ADD COLUMN IF NOT EXISTS machine_id text NOT NULL DEFAULT '';
ALTER TABLE public.radius_appliances DROP CONSTRAINT radius_appliances_pkey;
ALTER TABLE public.radius_appliances ADD CONSTRAINT radius_appliances_pkey PRIMARY KEY (id);
ALTER TABLE public.radius_appliances ADD CONSTRAINT radius_appliances_owner_host_machine_key UNIQUE (owner_id, hostname, machine_id);