import { useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Plan = { id: string; name: string };
type Row = Record<string, unknown>;

const COLS = ["nome", "documento", "telefone", "email", "tecnologia", "plano", "usuario", "senha", "ip", "mac", "vencimento", "rua", "numero", "bairro", "cidade", "uf", "cep", "observacoes"];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS: Record<string, string> = { nome: "nome", nomecompleto: "nome", cliente: "nome", documento: "documento", cpf: "documento", cnpj: "documento", cpfcnpj: "documento", telefone: "telefone", celular: "telefone", whatsapp: "telefone", email: "email", tecnologia: "tecnologia", tipo: "tecnologia", plano: "plano", usuario: "usuario", login: "usuario", pppoe: "usuario", senha: "senha", ip: "ip", ipfixo: "ip", mac: "mac", vencimento: "vencimento", diavencimento: "vencimento", rua: "rua", endereco: "rua", logradouro: "rua", numero: "numero", bairro: "bairro", cidade: "cidade", uf: "uf", estado: "uf", cep: "cep", observacoes: "observacoes", obs: "observacoes" };

function mapRow(r: Row) {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) { const key = ALIAS[norm(k)]; if (key) o[key] = String(v ?? "").trim(); }
  return o;
}

export function CustomerImport({ plans, userId, onClose, onDone }: { plans: Plan[]; userId: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<{ data: Record<string, string>; error?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function template() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([COLS, ["João da Silva", "123.456.789-00", "(11) 99999-0000", "joao@email.com", "pppoe", plans[0]?.name ?? "100 Mega", "joao", "senha123", "", "", "10", "Rua A", "100", "Centro", "São Paulo", "SP", "01000-000", ""]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo-clientes-syncron.xlsx");
  }

  async function readFile(file: File) {
    setResult("");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const json = XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    setRows(json.map(mapRow).filter(d => Object.values(d).some(Boolean)).map(d => {
      const tech = (d.tecnologia || "pppoe").toLowerCase();
      let error: string | undefined;
      if (!d.nome) error = "Sem nome";
      else if (!d.documento) error = "Sem documento";
      else if (!["pppoe", "ipoe", "hotspot"].includes(tech)) error = "Tecnologia inválida";
      else if (tech === "ipoe" && !/^(\d{1,3}\.){3}\d{1,3}$/.test(d.ip)) error = "IPoE exige IP";
      else if (tech === "ipoe" && !/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(d.mac)) error = "IPoE exige MAC";
      else if (d.plano && !plans.some(p => p.name.toLowerCase() === d.plano.toLowerCase())) error = `Plano "${d.plano}" não existe`;
      return { data: { ...d, tecnologia: tech }, error };
    }));
  }

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
        state: d.uf ? d.uf.toUpperCase() : null, postal_code: d.cep || null, created_by: userId,
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
    setRows([]); onDone();
  }

  const valid = rows.filter(r => !r.error).length;
  return <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-3xl overflow-y-auto bg-card p-6 shadow-xl">
    <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">IMPORTAR</p><h2 className="text-2xl font-extrabold">Clientes do Excel</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}><X /></Button></div>
    <p className="mt-3 text-sm text-muted-foreground">Envie um arquivo .xlsx, .xls ou .csv. A primeira linha deve ter os nomes das colunas: nome, documento, telefone, email, tecnologia (pppoe, ipoe ou hotspot), plano, usuario, senha, ip, mac, vencimento, rua, numero, bairro, cidade, uf, cep e observacoes. Só nome e documento são obrigatórios.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" onClick={template}><Download />Baixar modelo</Button>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="h-4 w-4" />Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} /></label>
    </div>
    {result && <p className="mt-4 rounded-md bg-muted p-3 text-sm">{result}</p>}
    {rows.length > 0 && <>
      <div className="mt-5 flex items-center justify-between"><p className="text-sm"><FileSpreadsheet className="mr-1 inline h-4 w-4" />{rows.length} linhas · <b>{valid} prontas</b> · {rows.length - valid} com problema</p><Button disabled={busy || !valid} onClick={importAll}>{busy ? "Importando..." : `Importar ${valid}`}</Button></div>
      <div className="mt-3 max-h-[60vh] overflow-auto border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-2">Nome</th><th className="p-2">Documento</th><th className="p-2">Tecnologia</th><th className="p-2">Plano</th><th className="p-2">Situação</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i} className="border-t"><td className="p-2">{r.data.nome || "—"}</td><td className="p-2">{r.data.documento || "—"}</td><td className="p-2 uppercase">{r.data.tecnologia}</td><td className="p-2">{r.data.plano || "—"}</td><td className={`p-2 ${r.error ? "text-destructive" : "text-primary"}`}>{r.error ?? "OK"}</td></tr>)}
      </tbody></table></div>
    </>}
  </div></div>;
}
