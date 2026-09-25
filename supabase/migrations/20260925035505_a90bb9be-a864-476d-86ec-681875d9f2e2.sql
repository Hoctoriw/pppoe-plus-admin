CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'viewer');
CREATE TYPE public.access_technology AS ENUM ('pppoe', 'ipoe');
CREATE TYPE public.customer_status AS ENUM ('active', 'suspended', 'pending', 'cancelled');
CREATE TYPE public.plan_status AS ENUM ('active', 'inactive');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_network()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_network() TO authenticated;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins view profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  download_mbps integer NOT NULL CHECK (download_mbps > 0),
  upload_mbps integer NOT NULL CHECK (upload_mbps > 0),
  monthly_price numeric(10,2) NOT NULL CHECK (monthly_price >= 0),
  technology public.access_technology,
  status public.plan_status NOT NULL DEFAULT 'active',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create plans" ON public.plans FOR INSERT TO authenticated WITH CHECK (public.can_manage_network());
CREATE POLICY "Managers update plans" ON public.plans FOR UPDATE TO authenticated USING (public.can_manage_network()) WITH CHECK (public.can_manage_network());
CREATE POLICY "Admins delete plans" ON public.plans FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  document text NOT NULL UNIQUE,
  email text,
  phone text NOT NULL,
  street text,
  address_number text,
  district text,
  city text,
  state text,
  postal_code text,
  technology public.access_technology NOT NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  pppoe_username text UNIQUE,
  pppoe_password text,
  ipoe_ip inet,
  mac_address macaddr,
  status public.customer_status NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_access_data CHECK (
    (technology = 'pppoe' AND pppoe_username IS NOT NULL) OR
    (technology = 'ipoe' AND ipoe_ip IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.can_manage_network() AND created_by = auth.uid());
CREATE POLICY "Managers update customers" ON public.customers FOR UPDATE TO authenticated USING (public.can_manage_network()) WITH CHECK (public.can_manage_network());
CREATE POLICY "Admins delete customers" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX customers_plan_id_idx ON public.customers(plan_id);
CREATE INDEX customers_status_idx ON public.customers(status);
CREATE INDEX customers_technology_idx ON public.customers(technology);
CREATE INDEX user_roles_user_id_idx ON public.user_roles(user_id);