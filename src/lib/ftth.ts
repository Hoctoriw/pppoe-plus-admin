export type NodeType = "olt" | "ceo" | "cto";

export type FtthNode = {
  id: string;
  owner_id: string;
  node_type: NodeType;
  name: string;
  latitude: number;
  longitude: number;
  parent_id: string | null;
  pon_port: number | null;
  tx_power_dbm: number;
  splitter_ratio: number;
  fusion_count: number;
  connector_count: number;
  ports: number;
  cable_fibers: number | null;
  cable_length_m: number | null;
  notes: string | null;
};

export const NODE_LABEL: Record<NodeType, string> = { olt: "OLT", ceo: "CEO (emenda)", cto: "CTO (atendimento)" };
export const SPLITTER_LOSS: Record<number, number> = { 1: 0, 2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5 };
export const FIBER_DB_PER_KM = 0.35;
export const FUSION_DB = 0.1;
export const CONNECTOR_DB = 0.5;
export const MIN_SIGNAL_DBM = -27;

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function cableLength(node: FtthNode, parent: FtthNode | undefined) {
  if (node.cable_length_m !== null && node.cable_length_m !== undefined) return Number(node.cable_length_m);
  return parent ? distanceM(parent, node) : 0;
}

export function nodeLoss(node: FtthNode) {
  return (SPLITTER_LOSS[node.splitter_ratio] ?? 0) + node.fusion_count * FUSION_DB + node.connector_count * CONNECTOR_DB;
}

export type Signal = { input: number | null; output: number | null; cableM: number };

export function computeSignals(nodes: FtthNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, Signal>();
  function calc(node: FtthNode, depth: number): Signal {
    const cached = cache.get(node.id);
    if (cached) return cached;
    let result: Signal;
    if (node.node_type === "olt") {
      result = { input: null, output: Number(node.tx_power_dbm) - nodeLoss(node), cableM: 0 };
    } else {
      const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
      const cableM = cableLength(node, parent);
      const parentOut = parent && depth < 50 ? calc(parent, depth + 1).output : null;
      const input = parentOut === null ? null : parentOut - (cableM / 1000) * FIBER_DB_PER_KM;
      result = { input, output: input === null ? null : input - nodeLoss(node), cableM };
    }
    cache.set(node.id, result);
    return result;
  }
  for (const n of nodes) calc(n, 0);
  return cache;
}

export function customerSignal(ctoOutput: number | null, dropM: number) {
  if (ctoOutput === null) return null;
  return ctoOutput - CONNECTOR_DB - (dropM / 1000) * FIBER_DB_PER_KM;
}

export function fmtDbm(v: number | null) {
  return v === null ? "—" : `${v.toFixed(2)} dBm`;
}
