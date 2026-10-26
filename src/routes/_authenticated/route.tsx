import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { LicenseGate } from "@/components/LicenseGate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession lê a sessão salva (e renova o token se preciso) — não derruba o login num recarregamento.
    const { data } = await supabase.auth.getSession();
    let user = data.session?.user ?? null;
    if (!user) {
      const r = await supabase.auth.getUser();
      user = r.data.user ?? null;
    }
    if (!user) throw redirect({ to: "/auth", search: { redirect: location.pathname } as never });
    return { user };
  },
  component: () => <LicenseGate><Outlet /></LicenseGate>,
});
