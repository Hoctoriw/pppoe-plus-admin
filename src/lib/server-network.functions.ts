import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Rede da própria máquina (só no servidor local). O painel grava um pedido em
// /opt/nexora/net-request.json; o serviço root nexora-netapply aplica no Debian.
const BASE = "/opt/nexora";

async function requireOwner(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("owner_id").eq("user_id", context.userId).not("owner_id", "is", null).maybeSingle();
  const owner = (data?.owner_id as string | undefined) ?? context.userId;
  if (owner !== context.userId) throw new Error("Apenas o dono da conta pode alterar a rede do servidor.");
}

export type ServerNetwork = { available: boolean; iface: string; ip: string; cidr: string; gateway: string; dns: string[]; mode: string; pending: boolean; lastResult: string };

export const getServerNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServerNetwork> => {
    await requireOwner(context);
    const empty: ServerNetwork = { available: false, iface: "", ip: "", cidr: "", gateway: "", dns: [], mode: "", pending: false, lastResult: "" };
    try {
      const fs = await import("fs");
      if (!fs.existsSync(BASE)) return empty;
      const read = (p: string) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
      const st = JSON.parse(read(`${BASE}/net-status.json`) || "{}");
      return {
        available: true,
        iface: st.iface ?? "", ip: st.ip ?? "", cidr: st.cidr ?? "", gateway: st.gateway ?? "",
        dns: Array.isArray(st.dns) ? st.dns : [], mode: st.mode ?? "",
        pending: fs.existsSync(`${BASE}/net-request.json`), lastResult: st.result ?? "",
      };
    } catch { return empty; }
  });

const ipv4 = z.string().trim().regex(/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/, "IP inválido");

export const setServerNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("dhcp") }),
    z.object({ mode: z.literal("static"), ip: ipv4, prefix: z.number().int().min(8).max(32), gateway: ipv4, dns1: ipv4, dns2: ipv4.or(z.literal("")) }),
  ]).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context);
    const fs = await import("fs");
    if (!fs.existsSync(BASE)) throw new Error("Disponível apenas no servidor local.");
    fs.writeFileSync(`${BASE}/net-request.json`, JSON.stringify(data), { mode: 0o600 });
    return { ok: true };
  });
