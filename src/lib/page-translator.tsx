import { useEffect } from "react";
import { LANGS, setLang, useLang, type Lang } from "@/lib/i18n";

// Translates visible page text (keyed by Portuguese text) without changing each screen.
type T = [string, string, string]; // pt, en, es
const PAIRS: T[] = [
  ["Entrar", "Sign in", "Iniciar sesión"], ["Senha", "Password", "Contraseña"], ["E-mail", "Email", "Correo"],
  ["Nome completo", "Full name", "Nombre completo"], ["Criar minha conta", "Create my account", "Crear mi cuenta"],
  ["Criar conta", "Create account", "Crear cuenta"], ["Esqueci minha senha", "Forgot my password", "Olvidé mi contraseña"],
  ["Continuar com Google", "Continue with Google", "Continuar con Google"], ["Ver recursos", "See features", "Ver funciones"],
  ["Sistema completo para provedor de internet", "Complete system for internet providers", "Sistema completo para proveedores de internet"],
  ["Sua rede, seus clientes e seus planos em um só lugar.", "Your network, customers and plans in one place.", "Tu red, tus clientes y tus planes en un solo lugar."],
  ["O que o Syncron ISP faz pelo seu provedor", "What Syncron ISP does for your provider", "Lo que Syncron ISP hace por tu proveedor"],
  ["O que dá para fazer no mapa da Rede FTTH", "What you can do on the FTTH network map", "Lo que puedes hacer en el mapa de la red FTTH"],
  ["Planos a partir de R$ 100/mês", "Plans from R$ 100/month", "Planes desde R$ 100/mes"],
  ["Mensal R$ 100 ou anual R$ 1.000, com a Rede FTTH inclusa.", "Monthly R$ 100 or yearly R$ 1,000, FTTH network included.", "Mensual R$ 100 o anual R$ 1.000, con la red FTTH incluida."],
  ["Operação sob controle", "Operation under control", "Operación bajo control"],
  ["Acesso protegido e dados isolados por função", "Protected access and data isolated by role", "Acceso protegido y datos aislados por función"],
  ["Instalação e configuração", "Installation and setup", "Instalación y configuración"], ["Salvar", "Save", "Guardar"],
  ["Cancelar", "Cancel", "Cancelar"], ["Excluir", "Delete", "Eliminar"], ["Editar", "Edit", "Editar"], ["Buscar", "Search", "Buscar"],
  ["Novo cliente", "New customer", "Nuevo cliente"], ["Novo plano", "New plan", "Nuevo plan"], ["Ativo", "Active", "Activo"],
  ["Ativos", "Active", "Activos"], ["Suspenso", "Suspended", "Suspendido"], ["Suspensos", "Suspended", "Suspendidos"],
  ["Pendente", "Pending", "Pendiente"], ["Ativar", "Activate", "Activar"], ["Bloquear", "Block", "Bloquear"],
  ["Clientes ativos", "Active customers", "Clientes activos"], ["Conexões online", "Online connections", "Conexiones en línea"],
  ["Receita mensal", "Monthly revenue", "Ingresos mensuales"], ["Nome", "Name", "Nombre"], ["Telefone", "Phone", "Teléfono"],
  ["Endereço", "Address", "Dirección"], ["Plano", "Plan", "Plan"], ["Valor", "Price", "Valor"], ["Vencimento", "Due date", "Vencimiento"],
  ["Ações", "Actions", "Acciones"], ["Cidade", "City", "Ciudad"], ["Bairro", "District", "Barrio"], ["Rua", "Street", "Calle"],
  ["Número", "Number", "Número"], ["Usuário", "Username", "Usuario"], ["Download", "Download", "Descargar"],
  ["Upload", "Upload", "Subida"], ["Velocidade", "Speed", "Velocidad"], ["Status", "Status", "Estado"], ["Fechar", "Close", "Cerrar"],
  ["Importar", "Import", "Importar"], ["Exportar", "Export", "Exportar"], ["Exportar mapa", "Export map", "Exportar mapa"],
  ["Localizar", "Locate", "Localizar"], ["Conectado", "Connected", "Conectado"], ["Desconectado", "Disconnected", "Desconectado"],
  ["Pago", "Paid", "Pagado"], ["Em aberto", "Open", "Abierto"], ["Vencido", "Overdue", "Vencido"], ["Faturas", "Invoices", "Facturas"],
  ["Emitir boleto", "Issue boleto", "Emitir boleto"], ["Roteadores", "Routers", "Routers"], ["Novo roteador", "New router", "Nuevo router"],
  ["Testar comunicação", "Test connection", "Probar conexión"], ["Aplicar no roteador", "Apply to router", "Aplicar al router"],
  ["Usuários e permissões", "Users and permissions", "Usuarios y permisos"], ["Renovar agora", "Renew now", "Renovar ahora"],
  ["Gerar Pix", "Generate Pix", "Generar Pix"], ["Copiar", "Copy", "Copiar"], ["Restaurar", "Restore", "Restaurar"],
  ["Baixar backup", "Download backup", "Descargar copia"], ["Mapa", "Map", "Mapa"], ["Sim", "Yes", "Sí"], ["Não", "No", "No"],
  ["Carregando…", "Loading…", "Cargando…"], ["Carregando...", "Loading...", "Cargando..."], ["Digitando…", "Typing…", "Escribiendo…"],
  ["Enviar", "Send", "Enviar"], ["Voltar", "Back", "Volver"], ["Próximo", "Next", "Siguiente"], ["Adicionar", "Add", "Agregar"],
  ["Tire dúvidas com nossa IA", "Ask our AI", "Pregunta a nuestra IA"], ["Olá! Pergunte qualquer coisa sobre o Syncron ISP.", "Hi! Ask anything about Syncron ISP.", "¡Hola! Pregunta lo que quieras sobre Syncron ISP."],
  ["Acesse a Central do Assinante", "Open the Subscriber Center", "Accede a la Central del Suscriptor"],
  ["Baixar a ISO Syncron", "Download the Syncron ISO", "Descargar la ISO Syncron"], ["Trocar IP do servidor", "Change server IP", "Cambiar IP del servidor"],
  ["Reiniciar RADIUS", "Restart RADIUS", "Reiniciar RADIUS"], ["Sincronizar agora", "Sync now", "Sincronizar ahora"],
  ["Usar RADIUS", "Use RADIUS", "Usar RADIUS"], ["Roteadores autorizados:", "Authorized routers:", "Routers autorizados:"],
  ["Visão geral", "Overview", "Resumen"], ["Clientes", "Customers", "Clientes"], ["Planos", "Plans", "Planes"], ["Usuários", "Users", "Usuarios"],
  ["Equipe", "Team", "Equipo"], ["Conexões", "Connections", "Conexiones"], ["Rede", "Network", "Red"], ["Rede FTTH", "FTTH Network", "Red FTTH"],
  ["Financeiro", "Billing", "Finanzas"], ["Licença", "License", "Licencia"], ["Suporte", "Support", "Soporte"], ["Sair", "Sign out", "Salir"],
  ["Idioma", "Language", "Idioma"], ["Dias de teste", "Trial days", "Días de prueba"], ["Mensal", "Monthly", "Mensual"], ["Anual", "Yearly", "Anual"],
];
const DICT = new Map<string, { en: string; es: string }>(PAIRS.map(([p, e, s]) => [p.toLowerCase(), { en: e, es: s }]));

const originals = new WeakMap<Node, string>();
const attrOrig = new WeakMap<Element, Record<string, string>>();
const ATTRS = ["placeholder", "title", "aria-label"];

function tr(src: string, lang: Lang) {
  if (lang === "pt-BR") return src;
  const t = src.trim();
  const hit = t && DICT.get(t.toLowerCase());
  return hit ? src.replace(t, hit[lang]) : src;
}

function apply(root: Node, lang: Lang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = root;
  while (n) {
    if (n.nodeType === 3) {
      const p = n.parentElement?.tagName;
      if (p !== "SCRIPT" && p !== "STYLE") {
        if (!originals.has(n)) originals.set(n, n.nodeValue ?? "");
        const next = tr(originals.get(n)!, lang);
        if (n.nodeValue !== next) n.nodeValue = next;
      }
    } else if (n.nodeType === 1) {
      const el = n as Element;
      let o = attrOrig.get(el);
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v == null) continue;
        if (!o) { o = {}; attrOrig.set(el, o); }
        if (!(a in o)) o[a] = v;
        const next = tr(o[a], lang);
        if (v !== next) el.setAttribute(a, next);
      }
    }
    n = walker.nextNode();
  }
}

export function PageTranslator() {
  const lang = useLang();
  useEffect(() => {
    apply(document.body, lang);
    let busy = false;
    const obs = new MutationObserver((muts) => {
      if (busy) return;
      busy = true;
      for (const m of muts) {
        if (m.type === "characterData") { originals.set(m.target, m.target.nodeValue ?? ""); apply(m.target, lang); }
        m.addedNodes.forEach((a) => apply(a, lang));
      }
      obs.takeRecords();
      busy = false;
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [lang]);

  return (
    <select
      aria-label="Idioma"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className="fixed bottom-3 left-3 z-[1000] h-9 rounded-full border bg-card px-3 text-sm text-foreground shadow-md"
    >
      {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
    </select>
  );
}
