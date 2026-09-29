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
  cable_fiber_number: number;
  cable_length_m: number | null;
  notes: string | null;
  splitter_type: SplitterType;
  splitter_tap: number;
  distribution_ratio: number;
  parent_leg: ParentLeg;
  cable_anchors: CableAnchor[];
};

export type SplitterType = "balanced" | "unbalanced";
export type ParentLeg = "tap" | "pass";
export type CableAnchor = { latitude: number; longitude: number };

export const NODE_LABEL: Record<NodeType, string> = { olt: "OLT", ceo: "CEO (emenda)", cto: "CTO (atendimento)" };
export const SPLITTER_LOSS: Record<number, number> = { 1: 0, 2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5 };
// Perdas típicas de splitter desbalanceado 1:2 — [derivada (tap), passagem]
export const UNBALANCED_LOSS: Record<number, [number, number]> = {
  5: [14.0, 0.6], 10: [10.7, 0.7], 15: [8.9, 0.9], 20: [7.8, 1.1], 25: [6.7, 1.4],
  30: [5.9, 1.8], 35: [5.2, 2.2], 40: [4.6, 2.6], 45: [4.1, 3.0], 50: [3.7, 3.7],
};
export const UNBALANCED_TAPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
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
  if (!parent) return 0;
  const path = [parent, ...(node.cable_anchors ?? []), node];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const point = path[index];
    if (previous && point) total += distanceM(previous, point);
  }
  return total;
}

export function unbalancedLoss(node: FtthNode): [number, number] {
  return UNBALANCED_LOSS[node.splitter_tap] ?? UNBALANCED_LOSS[10]!;
}

export function splitterLoss(node: FtthNode): { tap: number; pass: number | null } {
  if (node.splitter_type === "unbalanced") {
    const [tap, pass] = unbalancedLoss(node);
    return { tap, pass };
  }
  return { tap: SPLITTER_LOSS[node.splitter_ratio] ?? 0, pass: null };
}

export function fixedLoss(node: FtthNode) {
  return node.fusion_count * FUSION_DB + node.connector_count * CONNECTOR_DB;
}

/** Perda total da caixa na saída que atende clientes (derivada, no caso desbalanceado). */
export function nodeLoss(node: FtthNode) {
  return splitterLoss(node).tap + fixedLoss(node);
}

/** Perda da caixa na saída de passagem (só existe em splitter desbalanceado). */
export function nodePassLoss(node: FtthNode) {
  const { pass } = splitterLoss(node);
  return pass === null ? null : pass + fixedLoss(node);
}

/** Splitter de distribuição ligado na saída derivada (menor %) da caixa desbalanceada. */
export function distributionLoss(node: FtthNode) {
  if (node.splitter_type !== "unbalanced") return 0;
  return SPLITTER_LOSS[node.distribution_ratio ?? 1] ?? 0;
}

export type Signal = { input: number | null; output: number | null; passOutput: number | null; clientOutput: number | null; cableM: number };

/** A continuidade usa a saída que entrega a maior porcentagem do splitter. */
export function preferredParentLeg(parent: FtthNode | undefined): ParentLeg {
  return parent?.splitter_type === "unbalanced" ? "pass" : "tap";
}

export function computeSignals(nodes: FtthNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, Signal>();
  function calc(node: FtthNode, depth: number): Signal {
    const cached = cache.get(node.id);
    if (cached) return cached;
    let result: Signal;
    if (node.node_type === "olt") {
      const tx = Number(node.tx_power_dbm);
      const pass = nodePassLoss(node);
      result = { input: null, output: tx - nodeLoss(node), passOutput: pass === null ? null : tx - pass, cableM: 0 };
    } else {
      const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
      const cableM = cableLength(node, parent);
      let parentOut: number | null = null;
      if (parent && depth < 50) {
        const ps = calc(parent, depth + 1);
        const leg = preferredParentLeg(parent);
        parentOut = leg === "pass" && ps.passOutput !== null ? ps.passOutput : ps.output;
      }
      const input = parentOut === null ? null : parentOut - (cableM / 1000) * FIBER_DB_PER_KM;
      const pass = nodePassLoss(node);
      result = {
        input,
        output: input === null ? null : input - nodeLoss(node),
        passOutput: input === null || pass === null ? null : input - pass,
        cableM,
      };
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
