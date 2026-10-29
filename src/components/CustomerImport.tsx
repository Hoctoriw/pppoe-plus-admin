import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Plan = { id: string; name: string };
type Row = Record<string, unknown>;

const COLS = ["nome", "documento", "telefone", "email", "tecnologia", "plano", "usuario", "senha", "ip", "mac", "vencimento", "rua", "numero", "bairro", "cidade", "uf", "cep", "observacoes"] as const;

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS: Record<string, string> = { nome: "nome", nomecompleto: "nome", cliente: "nome", razaosocial: "nome", nomerazaosocial: "nome", nomecliente: "nome", documento: "documento", cpf: "documento", cnpj: "documento", cpfcnpj: "documento", cnpjcpf: "documento", cpfoucnpj: "documento", telefone: "telefone", celular: "telefone", whatsapp: "telefone", fone: "telefone", telefonecelular: "telefone", fonecelular: "telefone", celular1: "telefone", email: "email", email1: "email", tecnologia: "tecnologia", tipo: "tecnologia", tipoconexao: "tecnologia", plano: "plano", nomeplano: "plano", planoacesso: "plano", profile: "plano", perfil: "plano", usuario: "usuario", login: "usuario", pppoe: "usuario", loginpppoe: "usuario", user: "usuario", name: "usuario", senha: "senha", password: "senha", senhapppoe: "senha", ip: "ip", ipfixo: "ip", remoteaddress: "ip", enderecoip: "ip", mac: "mac", macaddress: "mac", callerid: "mac", vencimento: "vencimento", diavencimento: "vencimento", diavenc: "vencimento", venc: "vencimento", rua: "rua", endereco: "rua", logradouro: "rua", numero: "numero", num: "numero", bairro: "bairro", cidade: "cidade", municipio: "cidade", uf: "uf", estado: "uf", cep: "cep", observacoes: "observacoes", obs: "observacoes", observacao: "observacoes", comment: "observacoes" };

// MikroTik "/ppp secret export" (.rsc) → linhas de planilha
function parseRsc(text: string): Row[] {
  const out: Row[] = [];
  const joined = text.replace(/\\\r?\n\s*/g, "");
  for (const line of joined.split(/\r?\n/)) {
    if (!/^\s*add\s/.test(line)) continue;
    const r: Row = {};
    for (const m of line.matchAll(/([\w-]+)=("(?:[^"\\]|\\.)*"|\S+)/g)) r[m[1]!] = m[2]!.replace(/^"|"$/g, "").replace(/\\"/g, '"');
    const tech = String(r["service"] ?? "pppoe");
    const comment = String(r["comment"] ?? "");
    const doc = comment.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? "";
    out.push({ usuario: r["name"] ?? "", senha: r["password"] ?? "", plano: r["profile"] && r["profile"] !== "default" ? r["profile"] : "", ip: r["remote-address"] ?? "", tecnologia: tech === "any" ? "pppoe" : tech, nome: comment.replace(doc, "").replace(/[-|;,]+\s*$/, "").trim() || String(r["name"] ?? ""), documento: doc || String(r["name"] ?? ""), observacoes: "Importado do MikroTik" });
  }
  return out;
}

type D = Record<(typeof COLS)[number], string>;
function mapRow(r: Row): D {
  const o = Object.fromEntries(COLS.map(c => [c, ""])) as D;
  for (const [k, v] of Object.entries(r)) { const key = ALIAS[norm(k)]; if (key) o[key as keyof D] = String(v ?? "").trim(); }
  return o;
}

export function CustomerImport({ plans, userId, onClose, onDone }: { plans: Plan[]; userId: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<{ data: D; error?: string | undefined }[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function template() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([[...COLS], ["João da Silva", "123.456.789-00", "(11) 99999-0000", "joao@email.com", "pppoe", plans[0]?.name ?? "100 Mega", "joao", "senha123", "", "", "10", "Rua A", "100", "Centro", "São Paulo", "SP", "01000-000", ""]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo-clientes-syncron.xlsx");
  }

  const [defaultPlan, setDefaultPlan] = useState("");
  const [raw, setRaw] = useState<D[]>([]);
  const [source, setSource] = useState("");

  async function readFile(file: File) {
    setResult("");
    let json: Row[];
    const name = file.name.toLowerCase();
    if (/\.(rsc|txt)$/.test(name)) {
      json = parseRsc(await file.text()); setSource("MikroTik (/ppp secret export)");
    } else {
      const XLSX = await import("xlsx");
      let wb;
      if (name.endsWith(".csv")) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let text = new TextDecoder("utf-8").decode(buf);
        if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
        const first = text.split(/\r?\n/)[0] ?? "";
        const FS = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0] ?? ",";
        wb = XLSX.read(text, { type: "string", FS });
      } else wb = XLSX.read(await file.arrayBuffer());
      json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0] ?? ""]!, { defval: "", raw: false });
      const keys = Object.keys(json[0] ?? {}).map(norm).join(",");
      setSource(/razaosocial|cnpjcpf/.test(keys) ? "IXC / SGP" : /login/.test(keys) && /cpfcnpj|fone/.test(keys) ? "MK-AUTH" : "Planilha");
    }
    setRaw(json.map(mapRow).filter(d => Object.values(d).some(Boolean)));
  }

  const findPlan = (n: string) => plans.find(p => p.name.toLowerCase() === n.toLowerCase());
  useEffect(() => {
    setRows(raw.map(d => {
      let tech = (d.tecnologia || "pppoe").toLowerCase();
      if (tech.includes("ppp")) tech = "pppoe"; else if (tech.includes("hot")) tech = "hotspot"; else if (tech.includes("ipoe") || tech.includes("dhcp")) tech = "ipoe";
      const plano = d.plano && findPlan(d.plano) ? d.plano : (defaultPlan || d.plano);
      let error: string | undefined;
      if (!d.nome) error = "Sem nome";
      else if (!d.documento) error = "Sem documento";
      else if (!["pppoe", "ipoe", "hotspot"].includes(tech)) error = "Tecnologia inválida";
      else if (tech === "ipoe" && !/^(\d{1,3}\.){3}\d{1,3}$/.test(d.ip)) error = "IPoE exige IP";
      else if (tech === "ipoe" && !/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(d.mac)) error = "IPoE exige MAC";
      else if (plano && !findPlan(plano)) error = `Plano "${plano}" não existe`;
      return { data: { ...d, tecnologia: tech, plano, ip: /^(\d{1,3}\.){3}\d{1,3}$/.test(d.ip) ? d.ip : "" }, error };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, defaultPlan, plans]);

  async function importAll() {
    setBusy(true);
    const ok = rows.filter(r => !r.error).map(({ data: d }) => {
      const ipoe = d.tecnologia === "ipoe";
      const due = Number(d.vencimento);
      return {
        full_name: d.nome, document: d.documento, phone: d.telefone || "", email: d.email || null,
        technology: d.tecnologia as "pppoe" | "ipoe" | "hotspot",
        plan_id: plans.find(p => p.name.toLowerCase() === (d.plano ?? "").toLowerCase())?.id ?? null,
        pppoe_username: ipoe ? null : d.usuario || null, pppoe_password: ipoe ? null : d.senha || null,
        ipoe_ip: d.ip || null, mac_address: d.mac ? d.mac.toUpperCase().replace(/-/g, ":") : null,
        due_day: due >= 1 && due <= 31 ? due : null, notes: d.observacoes || null,
        street: d.rua || null, address_number: d.numero || null, district: d.bairro || null, city: d.cidade || null,
        state: d.uf ? d.uf.toUpperCase() : null, postal_code: d.cep || null, created_by: userId, status: "active",
      };
    });
    let done = 0; const fails: string[] = [];
    for (let i = 0; i < ok.length; i += 200) {
      const chunk = ok.slice(i, i + 200);
      const { error } = await supabase.from("customers").insert(chunk as never);
      if (!error) { done += chunk.length; continue; }
      for (const c of chunk) { const r = await supabase.from("customers").insert(c as never); if (r.error) fails.push(`${c.full_name}: ${r.error.message}`); else done++; }
    }
    setBusy(false);
    setResult(`${done} cliente(s) importado(s).${fails.length ? ` ${fails.length} falharam: ${fails.slice(0, 5).join("; ")}` : ""}`);
    setRows([]); setRaw([]); onDone();
  }

  const valid = rows.filter(r => !r.error).length;
  return <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-3xl overflow-y-auto bg-card p-6 shadow-xl">
    <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">IMPORTAR</p><h2 className="text-2xl font-extrabold">Clientes de planilha ou outro sistema</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button></div>
    <p className="mt-3 text-sm text-muted-foreground">Envie um arquivo .xlsx, .xls ou .csv. A primeira linha deve ter os nomes das colunas: nome, documento, telefone, email, tecnologia (pppoe, ipoe ou hotspot), plano, usuario, senha, ip, mac, vencimento, rua, numero, bairro, cidade, uf, cep e observacoes. Só nome e documento são obrigatórios.</p>
    <p className="mt-2 text-sm text-muted-foreground">Também aceita exportações do <b>MK-AUTH</b>, <b>IXC</b>, <b>SGP</b> e o arquivo <b>.rsc</b> do MikroTik (Winbox → Files, gerado com PPP → Secrets → Export). As colunas são reconhecidas automaticamente.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" onClick={template}><Download />Baixar modelo</Button>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="h-4 w-4" />Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv,.rsc,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} /></label>
    </div>
    <label className="mt-4 block text-sm">Plano para clientes sem plano ou com plano não cadastrado<select className="mt-1 block w-full rounded-md border bg-background p-2" value={defaultPlan} onChange={e => setDefaultPlan(e.target.value)}><option value="">Nenhum (mostrar erro)</option>{plans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
    {source && rows.length > 0 && <p className="mt-2 text-sm">Formato detectado: <b>{source}</b></p>}
    {result && <p className="mt-4 rounded-md bg-muted p-3 text-sm">{result}</p>}
    {rows.length > 0 && <>
      <div className="mt-5 flex items-center justify-between"><p className="text-sm"><FileSpreadsheet className="mr-1 inline h-4 w-4" />{rows.length} linhas · <b>{valid} prontas</b> · {rows.length - valid} com problema</p><Button disabled={busy || !valid} onClick={importAll}>{busy ? "Importando..." : `Importar ${valid}`}</Button></div>
      <div className="mt-3 max-h-[60vh] overflow-auto border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-2">Nome</th><th className="p-2">Documento</th><th className="p-2">Tecnologia</th><th className="p-2">Plano</th><th className="p-2">Situação</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i} className="border-t"><td className="p-2">{r.data.nome || "—"}</td><td className="p-2">{r.data.documento || "—"}</td><td className="p-2 uppercase">{r.data.tecnologia}</td><td className="p-2">{r.data.plano || "—"}</td><td className={`p-2 ${r.error ? "text-destructive" : "text-primary"}`}>{r.error ?? "OK"}</td></tr>)}
      </tbody></table></div>
    </>}
  </div></div>;
}
