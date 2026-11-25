export async function cleanupOwnerCommands(db: any, owner: string, now = Date.now()) {
  return db.from("router_commands").delete().eq("owner_id", owner).lt("created_at", new Date(now - 120000).toISOString());
}

export async function customerOwnedPlan(db: any, customer: { plan_id: string | null; owner_id: string }) {
  if (!customer.plan_id) return null;
  const { data: plan, error } = await db.from("plans").select("*").eq("id", customer.plan_id).eq("owner_id", customer.owner_id).maybeSingle();
  if (error || !plan) throw new Error("Plano não encontrado nesta conta.");
  return plan;
}
/** Impede que o painel na nuvem seja usado para acessar endereços internos/privados (use a Syncron Bridge para IPs locais). */
export function assertPublicRouterUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Endereço do roteador inválido."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Endereço do roteador deve usar http(s).");
  if (u.username || u.password) throw new Error("Endereço do roteador inválido.");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked = "Endereço privado/interno não é permitido. Para IP local, ative \"Via servidor local (Syncron Bridge)\".";
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) throw new Error(blocked);
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0)) throw new Error(blocked);
  } else if (/^\d+$/.test(h) || /^0x/i.test(h)) {
    throw new Error(blocked);
  }
  if (h.includes(":") && (h === "::" || h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:"))) throw new Error(blocked);
}
