export type RouterCreds = { base_url: string; username: string; password: string };

export const BLOCK_PROFILE = "nexora-bloqueio";
export const BLOCK_LIST = "nexora_bloqueados";

export function profileName(planName: string) {
  return "nexora-" + planName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function ros<T = any>(r: RouterCreds, method: string, path: string, body?: unknown): Promise<T> {
  const url = r.base_url.replace(/\/+$/, "") + "/rest" + path;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: "Basic " + btoa(`${r.username}:${r.password}`), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new Error("Roteador inacessível: " + (e instanceof Error ? e.message : String(e)));
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j.detail || j.message || text; } catch { /* ignore */ }
    throw new Error(`MikroTik ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Create or update a single item identified by a filter. */
export async function upsert(r: RouterCreds, path: string, filter: Record<string, string>, values: Record<string, string>) {
  const qs = new URLSearchParams(filter).toString();
  const found = await ros<any[]>(r, "GET", `${path}?${qs}`);
  if (found?.length) {
    await ros(r, "PATCH", `${path}/${encodeURIComponent(found[0][".id"])}`, values);
    return found[0][".id"] as string;
  }
  const created = await ros<any>(r, "PUT", path, { ...filter, ...values });
  return created?.[".id"] as string;
}

export async function removeWhere(r: RouterCreds, path: string, filter: Record<string, string>) {
  const found = await ros<any[]>(r, "GET", `${path}?${new URLSearchParams(filter)}`);
  for (const f of found ?? []) await ros(r, "DELETE", `${path}/${encodeURIComponent(f[".id"])}`);
}

/** Provisiona um cliente no roteador e grava o resultado no banco. Usado pelo botão manual e pelo sincronismo automático. */
export async function provisionOne(db: any, c: any, r: any): Promise<{ ok: boolean; error?: string }> {
  const plan = c.plans;
  const suspended = c.status === "suspended";
  const disabled = c.status === "cancelled" ? "yes" : "no";
  const tag = `nexora:${c.id}`;
  try {
    if (c.technology === "pppoe") {
      if (!plan) throw new Error("Cliente sem plano.");
      await upsert(r, "/ppp/secret", { name: c.pppoe_username! }, {
        password: c.pppoe_password ?? "", service: "pppoe", disabled, comment: `${tag} ${c.full_name}`,
        profile: suspended ? BLOCK_PROFILE : profileName(plan.name),
      });
      const act = await ros<any[]>(r, "GET", `/ppp/active?name=${encodeURIComponent(c.pppoe_username!)}`);
      for (const a of act ?? []) await ros(r, "DELETE", `/ppp/active/${encodeURIComponent(a[".id"])}`);
    } else {
      const ip = String(c.ipoe_ip);
      if (!c.mac_address) throw new Error("Informe o MAC do cliente IPoE.");
      await upsert(r, "/ip/dhcp-server/lease", { "mac-address": String(c.mac_address).toUpperCase() }, {
        address: ip, disabled, comment: `${tag} ${c.full_name}`, ...(r.dhcp_server ? { server: r.dhcp_server } : {}),
      });
      if (plan) {
        await upsert(r, "/queue/simple", { name: `nexora-${c.id.slice(0, 8)}` }, {
          target: `${ip}/32`, "max-limit": suspended ? "1M/1M" : `${plan.upload_mbps}M/${plan.download_mbps}M`, comment: tag,
        });
      }
      if (suspended) await upsert(r, "/ip/firewall/address-list", { list: BLOCK_LIST, address: ip }, { comment: tag });
      else await removeWhere(r, "/ip/firewall/address-list", { list: BLOCK_LIST, address: ip });
    }
    await db.from("customers").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), sync_error: null }).eq("id", c.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("customers").update({ sync_status: "error", sync_error: msg }).eq("id", c.id);
    return { ok: false, error: msg };
  }
}
