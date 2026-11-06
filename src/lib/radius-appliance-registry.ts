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
  // Only retire the unidentifiable pre-upgrade copy at the same address.
  // Names alone are not identities: multiple machines may share one hostname.
  if (heartbeat.machine_id && heartbeat.local_ip) {
    const { error: cleanupError } = await db.from("radius_appliances").delete()
      .eq("owner_id", heartbeat.owner_id).eq("hostname", heartbeat.hostname)
      .eq("local_ip", heartbeat.local_ip).eq("machine_id", "");
    if (cleanupError) throw cleanupError;
  }
}

export function visibleAppliances<T extends ApplianceIdentity>(rows: T[]): T[] {
  return rows.filter(row => row.machine_id || !row.local_ip || !rows.some(other =>
    other.machine_id && other.owner_id === row.owner_id &&
    other.hostname === row.hostname && other.local_ip === row.local_ip));
}