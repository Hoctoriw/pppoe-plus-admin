import type { FtthNode } from "@/lib/ftth";

export type ExportCustomer = { id: string; full_name: string; latitude: number | null; longitude: number | null; cto_id: string | null };
type Pt = { latitude: number; longitude: number };

function cablePath(node: FtthNode, parent: FtthNode): Pt[] {
  return [parent, ...(node.cable_anchors ?? []), node].map((p) => ({ latitude: Number(p.latitude), longitude: Number(p.longitude) }));
}

/** Projeção UTM (WGS84) em metros, para o desenho ficar em escala real no CAD. */
export function toUtm(lat: number, lon: number, zone: number) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const rad = Math.PI / 180, phi = lat * rad, lam0 = ((zone - 1) * 6 - 180 + 3) * rad;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lon * rad - lam0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) y += 10000000;
  return { x, y };
}

const LAYERS: Record<string, number> = { OLT: 4, CEO: 6, CTO: 5, CABOS: 3, ANCORAGENS: 8, CLIENTES: 2, TEXTOS: 7 };
const FIBER_ACI = [3, 2, 7, 5, 30, 4, 1, 250, 9, 40, 6, 140]; // F1..F12 aproximado em cores do AutoCAD

export function buildDxf(nodes: FtthNode[], customers: ExportCustomer[]) {
  const pts = [...nodes, ...customers.filter((c) => c.latitude != null)] as Pt[];
  const lon0 = pts.length ? pts.reduce((s, p) => s + Number(p.longitude), 0) / pts.length : -46;
  const zone = Math.floor((lon0 + 180) / 6) + 1;
  const P = (p: Pt) => toUtm(Number(p.latitude), Number(p.longitude), zone);
  const out: string[] = [];
  const w = (...a: (string | number)[]) => out.push(...a.map(String));
  w(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1015", 9, "$INSUNITS", 70, 6, 0, "ENDSEC");
  w(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, Object.keys(LAYERS).length);
  for (const [name, color] of Object.entries(LAYERS)) w(0, "LAYER", 2, name, 70, 0, 62, color, 6, "CONTINUOUS");
  w(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const clean = (s: string) => s.replace(/[\r\n]/g, " ");
  for (const n of nodes) {
    const layer = n.node_type.toUpperCase();
    const { x, y } = P(n);
    w(0, "CIRCLE", 8, layer, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, n.node_type === "olt" ? 4 : 2.5);
    w(0, "TEXT", 8, "TEXTOS", 10, (x + 3).toFixed(3), 20, (y + 3).toFixed(3), 30, 0, 40, 2.5, 1, clean(`${layer} ${n.name}`));
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    if (parent) {
      const path = cablePath(n, parent).map(P);
      const color = FIBER_ACI[(Math.max(1, n.cable_fiber_number || 1) - 1) % 12];
      w(0, "LWPOLYLINE", 8, "CABOS", 62, color, 90, path.length, 70, 0);
      for (const p of path) w(10, p.x.toFixed(3), 20, p.y.toFixed(3));
      for (const a of n.cable_anchors ?? []) { const q = P(a); w(0, "POINT", 8, "ANCORAGENS", 10, q.x.toFixed(3), 20, q.y.toFixed(3), 30, 0); }
    }
  }
  for (const c of customers) {
    if (c.latitude == null || c.longitude == null) continue;
    const q = P(c as Pt);
    w(0, "CIRCLE", 8, "CLIENTES", 10, q.x.toFixed(3), 20, q.y.toFixed(3), 30, 0, 40, 1);
    w(0, "TEXT", 8, "TEXTOS", 10, (q.x + 1.5).toFixed(3), 20, (q.y + 1.5).toFixed(3), 30, 0, 40, 1.5, 1, clean(c.full_name));
    const cto = c.cto_id ? byId.get(c.cto_id) : undefined;
    if (cto) { const t = P(cto); w(0, "LINE", 8, "CLIENTES", 10, t.x.toFixed(3), 20, t.y.toFixed(3), 30, 0, 11, q.x.toFixed(3), 21, q.y.toFixed(3), 31, 0); }
  }
  w(0, "ENDSEC", 0, "EOF");
  return out.join("\r\n");
}

export function buildGeoJson(nodes: FtthNode[], customers: ExportCustomer[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const features: unknown[] = [];
  for (const n of nodes) {
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [n.longitude, n.latitude] }, properties: { tipo: n.node_type.toUpperCase(), nome: n.name, splitter: n.splitter_ratio, portas: n.ports, notas: n.notes } });
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    if (parent) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: cablePath(n, parent).map((p) => [p.longitude, p.latitude]) }, properties: { tipo: "CABO", de: parent.name, para: n.name, fibra: n.cable_fiber_number, fibras_cabo: n.cable_fibers, comprimento_m: n.cable_length_m } });
  }
  for (const c of customers) if (c.latitude != null && c.longitude != null) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [c.longitude, c.latitude] }, properties: { tipo: "CLIENTE", nome: c.full_name, cto: c.cto_id ? byId.get(c.cto_id)?.name ?? null : null } });
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function buildKml(nodes: FtthNode[], customers: ExportCustomer[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pm: string[] = [];
  const color: Record<string, string> = { olt: "ffffff00", ceo: "ffff00ff", cto: "ffff0000" };
  for (const n of nodes) {
    pm.push(`<Placemark><name>${esc(`${n.node_type.toUpperCase()} ${n.name}`)}</name><Style><IconStyle><color>${color[n.node_type]}</color></IconStyle></Style><Point><coordinates>${n.longitude},${n.latitude},0</coordinates></Point></Placemark>`);
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    if (parent) pm.push(`<Placemark><name>${esc(`Cabo ${parent.name} → ${n.name} (F${n.cable_fiber_number})`)}</name><Style><LineStyle><color>ff00aa00</color><width>3</width></LineStyle></Style><LineString><coordinates>${cablePath(n, parent).map((p) => `${p.longitude},${p.latitude},0`).join(" ")}</coordinates></LineString></Placemark>`);
  }
  for (const c of customers) if (c.latitude != null && c.longitude != null) pm.push(`<Placemark><name>${esc(c.full_name)}</name><Point><coordinates>${c.longitude},${c.latitude},0</coordinates></Point></Placemark>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Rede FTTH - Syncron ISP</name>${pm.join("")}</Document></kml>`;
}

export function downloadText(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
