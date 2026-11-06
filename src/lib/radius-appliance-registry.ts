export type ApplianceIdentity = {
  id: string;
  owner_id: string;
  hostname: string;
  machine_id: string;
  local_ip: string | null;
};

export async function recordApplianceHeartbeat(db: any, heartbeat: Omit<ApplianceIdentity, "id"> & Record<string, unknown>) {
  const { error } = await db.from("radius_appliances").upsert(heartbeat, { onConflict: "owner_id,hostname,machine_id" });
  if (error) throw error;
}

export function visibleAppliances<T extends ApplianceIdentity>(rows: T[]): T[] {
  return rows;
}