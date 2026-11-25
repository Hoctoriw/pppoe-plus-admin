CREATE TABLE public.router_destination_approvals (
 router_id uuid PRIMARY KEY REFERENCES public.routers(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL,
 base_url text NOT NULL,
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.router_destination_approvals TO authenticated;
GRANT ALL ON public.router_destination_approvals TO service_role;
ALTER TABLE public.router_destination_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_reads_router_approvals ON public.router_destination_approvals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));