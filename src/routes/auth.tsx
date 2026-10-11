import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Download, Eye, EyeOff, Radio, ShieldCheck } from "lucide-react";
import iso from "@/assets/nexora-radius.iso.asset.json";
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
  const [tab, setTab] = useState<"login" | "download" | "guia">("login");
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
        <div className="mb-8 inline-flex rounded-md border bg-card p-1">{([["login", "Entrar"], ["download", "Download"], ["guia", "Instruções"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}</div>
        {tab === "guia" ? <Guia /> : tab === "download" ? <div>
          <p className="text-sm font-semibold text-primary">SERVIDOR RADIUS</p>
          <h2 className="mt-2 text-3xl font-extrabold">Baixar a ISO Nexora</h2>
          <p className="mt-2 text-sm text-muted-foreground">Debian 12 + FreeRADIUS + painel web local, instalação automática em modo texto.</p>
          <Button asChild className="mt-6 h-11 w-full"><a href={iso.url} download={iso.original_filename}><Download />Baixar {iso.original_filename} ({Math.round(iso.size / 1048576)} MB)</a></Button>
          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Grave num pendrive com Rufus ou Balena Etcher, ou use numa máquina virtual.</li>
            <li>Dê boot: a instalação é automática. <b className="text-foreground">Ela apaga o primeiro disco.</b></li>
            <li>Depois, acesse o painel local em <code>http://IP-da-máquina</code>.</li>
          </ol>
        </div> : <>
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
        </>}
        <p className="mt-8 text-center text-sm text-muted-foreground">É assinante? <Link to="/central" className="font-semibold text-primary">Acesse a Central do Assinante</Link></p>
      </div>
    </section>
  </main>;
}
const pre = "mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground";
function Guia() {
  return <div className="space-y-5 text-sm text-muted-foreground">
    <div><p className="text-sm font-semibold text-primary">GUIA RÁPIDO</p><h2 className="mt-2 text-3xl font-extrabold text-foreground">Instalação e configuração</h2></div>
    <div><p className="font-semibold text-foreground">1. Instalar a ISO</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5"><li>Baixe a ISO na aba Download e grave num pendrive (Rufus/Balena Etcher) ou use numa máquina virtual.</li><li>Dê boot: a instalação é automática em modo texto. <b className="text-foreground">Apaga o primeiro disco.</b></li><li>Login no terminal: usuário <code>root</code>, senha <code>yy6ErrpgZlhBb9A</code> (troque com <code>passwd</code>).</li><li>Painel local: <code>http://IP-da-máquina</code> (usuário <code>admin</code>).</li></ol></div>
    <div><p className="font-semibold text-foreground">2. Trocar o IP do servidor RADIUS (IP fixo)</p>
      <pre className={pre}>{`ip -br a        # veja o nome da placa (ex.: ens18)
nano /etc/network/interfaces
# troque "iface ens18 inet dhcp" por:
iface ens18 inet static
  address 192.168.88.2/24
  gateway 192.168.88.1
  dns-nameservers 1.1.1.1 8.8.8.8
systemctl restart networking`}</pre>
      <p className="mt-1">Depois, no painel em MikroTik → RADIUS, coloque o novo IP e clique em <b>Aplicar no roteador</b>.</p></div>
    <div><p className="font-semibold text-foreground">3. Ligar o MikroTik ao RADIUS (PPPoE, IPoE e Hotspot)</p>
      <pre className={pre}>{`/radius add service=ppp,dhcp,hotspot address=IP_DO_RADIUS secret="SEGREDO" authentication-port=1812 accounting-port=1813 timeout=3s comment="nexora-radius"
/ppp aaa set use-radius=yes accounting=yes interim-update=5m
/ip hotspot profile set [find] use-radius=yes radius-interim-update=5m
/radius incoming set accept=yes`}</pre></div>
    <div><p className="font-semibold text-foreground">4. Verificar</p>
      <pre className={pre}>{`systemctl status freeradius nginx nexora-agent
tail -f /var/log/freeradius/radius.log`}</pre>
      <p className="mt-1">Se o FreeRADIUS não subir, rode <code>freeradius -XC</code> e veja a última linha de erro.</p></div>
    <div><p className="font-semibold text-foreground">5. Central do Assinante</p><p>Divulgue o endereço <code>/central</code> para seus clientes: eles entram com CPF/CNPJ e a senha da conexão para ver plano, consumo e boletos.</p></div>
  </div>;
}
