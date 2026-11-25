import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRouterMaster, routerDestination } from "./router-destination-guards";

export const listRouterDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRouterMaster(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: routers, error } = await db.from("routers").select("id,owner_id,name,base_url").eq("via_agent", false).order("name");
    const { data: approvals, error: approvalError } = await db.from("router_destination_approvals").select("router_id,owner_id,base_url,approved_at");
    if (error || approvalError) throw new Error("Não foi possível consultar os destinos.");
    const { data: users, error: userError } = await context.supabase.rpc("admin_list_users");
    if (userError) throw new Error("Não foi possível consultar os proprietários.");
    const owners = (users ?? []) as { id: string; email: string; full_name?: string }[];
    return (routers ?? []).map(r => {
      let valid = true, destination = "";
      try { destination = routerDestination(r.base_url); } catch { valid = false; }
      const approval = approvals?.find(a => a.router_id === r.id && a.owner_id === r.owner_id && a.base_url === destination);
      const owner = owners.find(o => o.id === r.owner_id);
      return { ...r, owner: owner?.email ?? r.owner_id, valid, approved: Boolean(approval), approved_at: approval?.approved_at ?? null };
    });
  });

export const setRouterDestinationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), base_url: z.string().max(200), approved: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireRouterMaster(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: router, error } = await db.from("routers").select("id,owner_id,base_url,via_agent").eq("id", data.id).single();
    if (error || !router) throw new Error("Roteador não encontrado.");
    if (router.base_url !== data.base_url) throw new Error("O endereço mudou. Atualize a lista antes de aprovar.");
    if (router.via_agent) throw new Error("Este roteador utiliza o servidor local.");
    if (data.approved) {
      const { error: writeError } = await db.from("router_destination_approvals").upsert({
        router_id: router.id, owner_id: router.owner_id, base_url: routerDestination(router.base_url),
        approved_by: context.userId, approved_at: new Date().toISOString(),
      });
      if (writeError) throw new Error("Não foi possível aprovar o destino.");
    } else {
      const { error: writeError } = await db.from("router_destination_approvals").delete().eq("router_id", router.id).eq("owner_id", router.owner_id);
      if (writeError) throw new Error("Não foi possível revogar a aprovação.");
    }
    return { ok: true };
  });