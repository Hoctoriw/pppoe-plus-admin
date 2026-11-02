import { useEffect, useState } from "react";

export const LANGS = [
  { id: "pt-BR", label: "🇧🇷 Português" },
  { id: "en", label: "🇺🇸 English" },
  { id: "es", label: "🇪🇸 Español" },
] as const;
export type Lang = (typeof LANGS)[number]["id"];

const KEY = "syncron-lang";
const EVT = "syncron-lang-change";

// Dicionário indexado pelo texto em português.
const DICT: Record<string, { en: string; es: string }> = {
  "Visão geral": { en: "Overview", es: "Resumen" },
  "Clientes": { en: "Customers", es: "Clientes" },
  "Planos": { en: "Plans", es: "Planes" },
  "MikroTik": { en: "MikroTik", es: "MikroTik" },
  "Usuários": { en: "Users", es: "Usuarios" },
  "Equipe": { en: "Team", es: "Equipo" },
  "Conexões": { en: "Connections", es: "Conexiones" },
  "Rede": { en: "Network", es: "Red" },
  "Financeiro": { en: "Billing", es: "Finanzas" },
  "Backup": { en: "Backup", es: "Copia de seguridad" },
  "Licença": { en: "License", es: "Licencia" },
  "Suporte": { en: "Support", es: "Soporte" },
  "Sair": { en: "Sign out", es: "Salir" },
  "Idioma": { en: "Language", es: "Idioma" },
};

export function translate(text: string, lang: Lang) {
  if (lang === "pt-BR") return text;
  return DICT[text]?.[lang] ?? text;
}

export function setLang(lang: Lang) {
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  window.dispatchEvent(new Event(EVT));
}

export function useLang(): Lang {
  const [lang, set] = useState<Lang>("pt-BR");
  useEffect(() => {
    const read = () => {
      const v = localStorage.getItem(KEY) as Lang | null;
      const l = v && LANGS.some((x) => x.id === v) ? v : "pt-BR";
      set(l);
      document.documentElement.lang = l;
    };
    read();
    window.addEventListener(EVT, read);
    return () => window.removeEventListener(EVT, read);
  }, []);
  return lang;
}

export function Tr({ text }: { text: string }) {
  const lang = useLang();
  return <>{translate(text, lang)}</>;
}

export function LanguageSelect({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-semibold">{translate("Idioma", lang)}</span>
      <select
        aria-label="Idioma"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="h-9 rounded-md border bg-background px-3 text-foreground"
      >
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}
