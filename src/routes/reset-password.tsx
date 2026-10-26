import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Nova senha | Syncron ISP" },
    { name: "description", content: "Crie uma nova senha para acessar o painel Syncron ISP." },
    { property: "og:title", content: "Nova senha | Syncron ISP" },
    { property: "og:description", content: "Crie uma nova senha para acessar o painel Syncron ISP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true); });
    void supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("pw")), pw2 = String(f.get("pw2"));
    if (pw !== pw2) return setMsg("As senhas não conferem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    navigate({ to: "/dashboard", replace: true });
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <h1 className="text-2xl font-extrabold">Criar nova senha</h1>
      {!ready ? <p className="text-sm text-muted-foreground">Abra esta página pelo link enviado ao seu e-mail.</p> : <>
        <div className="space-y-2"><Label htmlFor="pw">Nova senha</Label><Input id="pw" name="pw" type="password" minLength={6} required /></div>
        <div className="space-y-2"><Label htmlFor="pw2">Repita a senha</Label><Input id="pw2" name="pw2" type="password" minLength={6} required /></div>
        <Button className="h-11 w-full" disabled={busy}>{busy ? "Salvando..." : "Salvar nova senha"}</Button>
      </>}
      {msg && <p className="text-sm text-destructive">{msg}</p>}
    </form>
  </main>;
}
