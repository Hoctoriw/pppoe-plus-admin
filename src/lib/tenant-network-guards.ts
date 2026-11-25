export async function cleanupOwnerCommands(db: any, owner: string, now = Date.now()) {
  return db.from("router_commands").delete().eq("owner_id", owner).lt("created_at", new Date(now - 120000).toISOString());
}

export async function customerOwnedPlan(db: any, customer: { plan_id: string | null; owner_id: string }) {
  if (!customer.plan_id) return null;
  const { data: plan, error } = await db.from("plans").select("*").eq("id", customer.plan_id).eq("owner_id", customer.owner_id).maybeSingle();
  if (error || !plan) throw new Error("Plano não encontrado nesta conta.");
  return plan;
}