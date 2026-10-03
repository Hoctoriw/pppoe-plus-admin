import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Eye, EyeOff, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar | Nexora ISP" },
    { name: "description", content: "Acesso seguro ao painel administrativo Nexora ISP." },
    { property: "og:title", content: "Entrar | Nexora ISP" },
    { property: "og:description", content: "Acesso seguro ao painel administrativo Nexora ISP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage("E-mail ou senha inválidos.");
      else navigate({ to: "/dashboard", replace: true });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Confira seu e-mail para confirmar a conta.");
      else navigate({ to: "/dashboard", replace: true });
    }
    setLoading(false);
  }

  async function googleSignIn() {
    setLoading(true); setMessage("");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { setMessage("Não foi possível entrar com o Google."); setLoading(false); return; }
    if (!result.redirected) navigate({ to: "/dashboard", replace: true });
  }

  return <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
    <section className="hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3 text-xl font-extrabold"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div>
      <div className="max-w-xl"><p className="mb-6 text-sm font-semibold uppercase text-sidebar-primary">Operação sob controle</p><h1 className="text-5xl font-extrabold leading-tight">Sua rede, seus clientes e seus planos em um só lugar.</h1><p className="mt-6 max-w-lg text-lg text-sidebar-foreground/70">Uma base moderna para operar acessos PPPoE e IPoE com clareza e segurança.</p></div>
      <div className="flex items-center gap-2 text-sm text-sidebar-foreground/60"><ShieldCheck className="h-4 w-4 text-sidebar-primary" />Acesso protegido e dados isolados por função</div>
    </section>
    <section className="flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-3 text-lg font-extrabold lg:hidden"><Radio className="text-primary" />NEXORA ISP</div>
        <p className="text-sm font-semibold text-primary">PAINEL ADMINISTRATIVO</p>
        <h2 className="mt-2 text-3xl font-extrabold">{mode === "login" ? "Bem-vindo de volta" : "Criar acesso"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{mode === "login" ? "Entre para continuar gerenciando sua operação." : "Cadastre seu usuário para começar."}</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          {mode === "signup" && <div className="space-y-2"><Label htmlFor="fullName">Nome completo</Label><Input id="fullName" name="fullName" required placeholder="Seu nome" /></div>}
          <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" required placeholder="voce@provedor.com.br" /></div>
          <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><Input id="password" name="password" type={showPassword ? "text" : "password"} required minLength={6} className="pr-10" /><Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-0 top-0" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>
          {message && <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{message}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OU<span className="h-px flex-1 bg-border" /></div>
        <Button variant="outline" className="h-11 w-full" onClick={googleSignIn} disabled={loading}>Continuar com Google</Button>
        <p className="mt-7 text-center text-sm text-muted-foreground">{mode === "login" ? "Ainda não tem acesso?" : "Já possui uma conta?"} <Button variant="link" className="h-auto px-1" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Criar conta" : "Entrar"}</Button></p>
      </div>
    </section>
  </main>;
}