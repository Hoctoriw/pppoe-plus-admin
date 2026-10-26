import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Activity, Download, Eye, EyeOff, MapPin, Radio, Ruler, Search, ShieldCheck, Split, Wifi } from "lucide-react";
import iso from "@/assets/nexora-radius.iso.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar | Syncron ISP" },
    { name: "description", content: "Acesso seguro ao painel administrativo Syncron ISP." },
    { property: "og:title", content: "Entrar | Syncron ISP" },
    { property: "og:description", content: "Acesso seguro ao painel administrativo Syncron ISP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//") ? s.redirect : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { redirect: back } = Route.useSearch();
  const navigate = (_o: { to: string; replace?: boolean }) => nav({ to: (back || "/dashboard") as "/dashboard", replace: true });
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
      <div className="flex items-center gap-3 text-xl font-extrabold"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar text-sidebar-primary-foreground"><img src="/syncron-logo.png" alt="Syncron" className="h-full w-full object-contain" /></span>SYNCRON <span className="text-sidebar-primary">ISP</span></div>
      <div className="max-w-xl"><p className="mb-6 text-sm font-semibold uppercase text-sidebar-primary">Operação sob controle</p><h1 className="text-5xl font-extrabold leading-tight">Sua rede, seus clientes e seus planos em um só lugar.</h1><p className="mt-6 max-w-lg text-lg text-sidebar-foreground/70">Uma base moderna para operar acessos PPPoE e IPoE com clareza e segurança.</p>
        <div className="mt-8 max-w-lg rounded-md border border-sidebar-border bg-sidebar-accent/40 p-5">
          <p className="text-sm font-bold uppercase text-sidebar-primary">O que dá para fazer no mapa da Rede FTTH</p>
          <ul className="mt-3 space-y-2.5 text-sm text-sidebar-foreground/75">
            <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Marcar OLT, CEO e CTO direto no mapa, na posição real de cada caixa.</span></li>
            <li className="flex gap-2.5"><Split className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Escolher o splitter de cada caixa — balanceado de 1:2 a 1:64 ou desbalanceado — e a porta e a fibra usadas em cada cabo.</span></li>
            <li className="flex gap-2.5"><Ruler className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Desenhar o trajeto do cabo com pontos de ancoragem em postes, esquinas e curvas, e ver a metragem com as sobras deixadas em cada caixa.</span></li>
            <li className="flex gap-2.5"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Conferir o sinal que chega e o sinal que sai de cada caixa, com aviso quando ficar abaixo de -27 dBm.</span></li>
            <li className="flex gap-2.5"><Wifi className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Ligar clientes às portas da CTO e ver no mapa quem está conectado (verde) ou desconectado (vermelho).</span></li>
            <li className="flex gap-2.5"><Search className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-primary" /><span>Buscar por cidade, endereço ou nome de uma caixa para localizá-la na rede.</span></li>
          </ul>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-sidebar-foreground/60"><ShieldCheck className="h-4 w-4 text-sidebar-primary" />Acesso protegido e dados isolados por função</div>
    </section>
    <section className="flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-3 text-lg font-extrabold lg:hidden"><img src="/syncron-logo.png" alt="Syncron" className="h-8 w-8" />SYNCRON ISP</div>
        <div className="mb-8 inline-flex rounded-md border bg-card p-1">{([["login", "Entrar"], ["download", "Download"], ["guia", "Instruções"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}</div>
        {tab === "guia" ? <Guia /> : tab === "download" ? <div>
          <p className="text-sm font-semibold text-primary">SERVIDOR RADIUS</p>
          <h2 className="mt-2 text-3xl font-extrabold">Baixar a ISO Syncron</h2>
          <p className="mt-2 text-sm text-muted-foreground">syncron-radius + painel web local, instalação automática em modo texto.</p>
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
      <ol className="mt-1 list-decimal space-y-1 pl-5"><li>Baixe a ISO na aba Download e grave num pendrive (Rufus/Balena Etcher) ou use numa máquina virtual.</li><li>Dê boot: a instalação é automática. <b className="text-foreground">Apaga o primeiro disco.</b></li><li>No fim, a tela mostra o IP da máquina. Abra <code>http://IP-da-máquina/appliance</code> no navegador.</li></ol></div>
    <div><p className="font-semibold text-foreground">2. Painel web local (appliance)</p>
      <p>Abra <code>http://IP-da-máquina/appliance</code> ou clique em <b>Trocar IP do servidor</b> em MikroTik → RADIUS no painel na nuvem. Entre com o <b>mesmo e-mail e senha do usuário master</b>.</p>
      <ul className="mt-1 list-disc space-y-1 pl-5"><li><b>Status:</b> RADIUS, ponte, conexão com a nuvem, CPU, memória e disco.</li><li><b>Roteadores autorizados:</b> nome e IP de cada MikroTik.</li><li><b>Trocar IP:</b> IP fixo ou automático, gateway e DNS — tudo pelo navegador.</li><li><b>Log:</b> rejeições e timeouts do RADIUS.</li><li><b>Reiniciar RADIUS</b> e <b>Sincronizar agora</b> com um clique.</li></ul></div>
    <div><p className="font-semibold text-foreground">3. Cadastrar o MikroTik (IP local)</p>
      <p>No painel na nuvem, abra <b>MikroTik → IP local → Novo roteador</b> e informe o IP local do roteador (ex.: <code>192.168.88.1</code>), usuário e senha da API. O servidor local faz a ponte — ele precisa estar ligado. No Winbox/Webfig, ative <b>IP → Services → www</b>.</p></div>
    <div><p className="font-semibold text-foreground">4. Ligar o RADIUS</p>
      <p>Em <b>MikroTik → RADIUS</b>, marque <b>Usar RADIUS</b>, escolha o servidor conectado, defina o segredo, clique em <b>Salvar</b> e depois em <b>Aplicar no roteador</b>. Use <b>Testar comunicação</b> para conferir. Portas UDP: <b>1812</b>, <b>1813</b> e <b>3799</b>.</p></div>
    <div><p className="font-semibold text-foreground">5. Faixas de IP dos clientes</p>
      <p>Ativos recebem IP fixo de <code>192.168.0.0/16</code>; suspensos recebem <code>10.0.0.0/8</code> e vão para a lista <code>bloqueados</code>. Veja os IPs livres em <b>Conexões</b> e a página de aviso em <b>MikroTik → Página de bloqueio</b>.</p></div>
    <div><p className="font-semibold text-foreground">6. Verificar</p>
      <p>No painel na nuvem, o servidor aparece <b>online</b> em MikroTik → RADIUS. No painel local, confira as abas <b>Status</b> e <b>Log</b>.</p></div>
    <div><p className="font-semibold text-foreground">7. Central do Assinante</p><p>Divulgue o endereço <code>/central</code> para seus clientes: eles entram com CPF/CNPJ e a senha da conexão para ver plano, consumo e boletos.</p></div>
  </div>;
}
