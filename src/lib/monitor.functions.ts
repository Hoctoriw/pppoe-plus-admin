import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertLicensed } from "./license.server";
import { ros } from "./mikrotik.server";

export type RouterStats = {
  ok: boolean; error?: string; identity?: string; version?: string; uptime?: string;
  cpu?: number; memUsed?: number; memTotal?: number; temperature?: number | null; voltage?: number | null;
  pppActive?: number; interfaces?: { name: string; rxBps: number; txBps: number; running: boolean }[];
};

export const routerStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RouterStats> => {
    await assertLicensed(context.supabase);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: r } = await db.from("routers").select("*").eq("id", data.id).eq("owner_id", context.userId).single();
    if (!r) return { ok: false, error: "Roteador não encontrado." };
    try {
      const [id, res, health, ppp, ifs] = await Promise.all([
        ros<any>(r, "GET", "/system/identity"),
        ros<any>(r, "GET", "/system/resource"),
        ros<any[]>(r, "GET", "/system/health").catch(() => []),
        ros<any[]>(r, "GET", "/ppp/active").catch(() => []),
        ros<any[]>(r, "GET", "/interface").catch(() => []),
      ]);
      const running = (ifs ?? []).filter((i) => i.type !== "pppoe-in" && !i.disabled?.toString().startsWith("t")).slice(0, 12);
      let traffic: any[] = [];
      if (running.length) {
        traffic = await ros<any[]>(r, "POST", "/interface/monitor-traffic", { interface: running.map((i) => i.name).join(","), once: "" }).catch(() => []);
      }
      const h = Array.isArray(health) ? health : [];
      const hv = (n: string) => { const x = h.find((e) => e.name === n); return x ? Number(x.value) : null; };
      return {
        ok: true, identity: id?.name, version: res?.version, uptime: res?.uptime,
        cpu: Number(res?.["cpu-load"] ?? 0),
        memTotal: Number(res?.["total-memory"] ?? 0),
        memUsed: Number(res?.["total-memory"] ?? 0) - Number(res?.["free-memory"] ?? 0),
        temperature: hv("temperature") ?? hv("cpu-temperature"), voltage: hv("voltage"),
        pppActive: Array.isArray(ppp) ? ppp.length : 0,
        interfaces: running.map((i) => {
          const t = (traffic ?? []).find((x: any) => x.name === i.name) ?? {};
          return { name: i.name, running: String(i.running) === "true", rxBps: Number(t["rx-bits-per-second"] ?? 0), txBps: Number(t["tx-bits-per-second"] ?? 0) };
        }),
      };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });
