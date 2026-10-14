import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { POOL_CIDR, POOL_SIZE, freeIps, inPool } from "@/lib/ip-pool";

export function IpPoolPanel() {
  const [used, setUsed] = useState<{ ip: string; name: string }[]>([]);
  const [hideUsed, setHideUsed] = useState(true);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    void supabase.from("customers").select("full_name, ipoe_ip").not("ipoe_ip", "is", null).then(({ data }) => {
      setUsed((data ?? []).map(c => ({ ip: String(c.ipoe_ip), name: c.full_name })).filter(u => inPool(u.ip)));
    });
  }, []);
  const usedSet = useMemo(() => new Set(used.map(u => u.ip)), [used]);
  const free = useMemo(() => freeIps(usedSet, limit).filter(ip => ip.includes(q)), [usedSet, limit, q]);
  const usedList = used.filter(u => `${u.ip} ${u.name}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return <section className="mt-6 border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div><h2 className="font-bold">Pool de IPs {POOL_CIDR}</h2><p className="text-xs text-muted-foreground">{POOL_SIZE.toLocaleString("pt-BR")} IPs · {used.length} em uso · {(POOL_SIZE - used.length).toLocaleString("pt-BR")} livres</p></div>
      <Input className="sm:ml-auto sm:w-56" placeholder="Filtrar IP ou cliente" value={q} onChange={e => setQ(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hideUsed} onChange={e => setHideUsed(e.target.checked)} />Ocultar IPs em uso</label>
    </div>
    <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
      {!hideUsed && usedList.map(u => <span key={u.ip} title={u.name} className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-xs">{u.ip} · {u.name}</span>)}
      {free.map(ip => <span key={ip} className="rounded border px-2 py-1 font-mono text-xs">{ip}</span>)}
    </div>
    <Button className="mt-3" size="sm" variant="outline" onClick={() => setLimit(l => l + 200)}>Mostrar mais IPs livres</Button>
  </section>;
}
