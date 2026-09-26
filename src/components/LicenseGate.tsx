import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { getMyLicense } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PixCheckout } from "@/components/PixCheckout";

export function LicenseGate({ children }: { children: ReactNode }) {
  const fetchLicense = useServerFn(getMyLicense);
  const [state, setState] = useState<{ valid: boolean; admin: boolean; expires_at: string | null } | null>(null);
  useEffect(() => { fetchLicense().then(setState).catch(() => setState({ valid: true, admin: false, expires_at: null })); }, []);
  if (!state) return null;
  if (state.valid) {
    const days = state.expires_at ? Math.ceil((new Date(state.expires_at).getTime() - Date.now()) / 86400000) : null;
    return <>
      {!state.admin && days !== null && days <= 7 && (
        <div className="bg-primary/10 px-4 py-2 text-center text-sm text-foreground">Seu acesso expira em {days} dia(s). Entre em contato para adquirir uma licença.</div>
      )}
      {children}
    </>;
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <KeyRound className="mx-auto mb-4 h-10 w-10 text-primary" />
        <h1 className="mb-2 text-xl font-bold">Licença necessária</h1>
        <p className="mb-6 text-sm text-muted-foreground">Seu acesso terminou{state.expires_at ? ` em ${new Date(state.expires_at).toLocaleDateString("pt-BR")}` : ""}. Escolha um plano e pague via Pix para renovar.</p>
        <div className="mb-6"><PixCheckout /></div>
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>Sair</Button>
      </div>
    </div>
  );
}
