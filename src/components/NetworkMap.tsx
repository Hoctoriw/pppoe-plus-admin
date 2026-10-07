import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { addBaseLayers, cssVar, loadMaps } from "@/components/ConnectionsMap";
import { geocodePlaceQuery, type PlaceResult } from "@/lib/connections.functions";
import type { CableAnchor, FtthNode } from "@/lib/ftth";

export type MapCustomer = { id: string; name: string; latitude: number; longitude: number; cto_id: string | null; weak: boolean };

type Props = {
  nodes: FtthNode[];
  customers: MapCustomer[];
  selectedId: string | null;
  placing: boolean;
  onSelect: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onAnchorSelect: (index: number) => void;
  onAnchorMove: (index: number, point: CableAnchor) => void;
  onCustomerMove: (id: string, latitude: number, longitude: number) => void;
  onFindNode?: (id: string) => void;
};

export function NetworkMap({ nodes, customers, selectedId, placing, onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove, onFindNode }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const cb = useRef({ onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove });
  const fitted = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  cb.current = { onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove };

  useEffect(() => {
    let cancelled = false;
    loadMaps().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, { center: [-14.235, -51.9253], zoom: 4, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      addBaseLayers(L, map);
      map.on("click", (e) => cb.current.onMapClick(e.latlng.lat, e.latlng.lng));
      LRef.current = L;
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Mapa indisponível."));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (el) el.style.cursor = placing ? "crosshair" : "";
  }, [placing, ready]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const bounds = L.latLngBounds([]);
    const badge = (text: string, bg: string, fg: string, border: string, size = 22) => L.divIcon({
      className: "",
      iconSize: [Math.max(size, text.length * 7 + 8), size],
      html: `<div style="display:flex;align-items:center;justify-content:center;height:${size}px;padding:0 4px;border-radius:999px;background:${bg};color:${fg};border:2px solid ${border};font:700 10px Manrope,sans-serif;white-space:nowrap">${text}</div>`,
    });
    const stop = (e: any) => L.DomEvent.stopPropagation(e);

    for (const n of nodes) {
      const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
      if (!parent) continue;
      const anchors = n.cable_anchors ?? [];
      const path: [number, number][] = [[parent.latitude, parent.longitude], ...anchors.map((a): [number, number] => [a.latitude, a.longitude]), [n.latitude, n.longitude]];
      const pc = cssVar(`--ftth-${parent.node_type}`);
      const line = L.polyline(path, { color: pc, opacity: 0.9, weight: n.id === selectedId ? 6 : 4 });
      line.on("click", (e) => { stop(e); cb.current.onSelect(n.id); });
      line.addTo(layer);
      const middle = path[Math.floor(path.length / 2)];
      if (middle) L.marker(middle, { interactive: false, zIndexOffset: 50, icon: badge(`F${n.cable_fiber_number ?? 1}`, cssVar("--card"), cssVar("--foreground"), pc, 20) }).addTo(layer);
      if (n.id === selectedId) anchors.forEach((anchor, index) => {
        const slack = Number(anchor.slack_m ?? 0);
        const m = L.marker([anchor.latitude, anchor.longitude], {
          draggable: true, zIndexOffset: 300,
          title: slack > 0 ? `Ancoragem ${index + 1} · reserva de ${slack} m` : `Ancoragem ${index + 1}`,
          icon: badge(slack > 0 ? `${index + 1}·${slack}m` : String(index + 1), cssVar(slack > 0 ? "--ftth-ceo" : "--primary"), cssVar("--primary-foreground"), cssVar("--card"), slack > 0 ? 22 : 18),
        });
        m.on("click", (e) => { stop(e); cb.current.onAnchorSelect(index); });
        m.on("dragend", () => { const p = m.getLatLng(); cb.current.onAnchorMove(index, { latitude: p.lat, longitude: p.lng, slack_m: anchor.slack_m ?? 0 }); });
        m.addTo(layer);
      });
    }
    for (const c of customers) {
      const cto = c.cto_id ? byId.get(c.cto_id) : undefined;
      if (cto) L.polyline([[cto.latitude, cto.longitude], [c.latitude, c.longitude]], { color: cssVar("--muted-foreground"), weight: 2, opacity: 0.8, dashArray: "4 6", interactive: false }).addTo(layer);
      const fill = cssVar(c.weak ? "--map-suspended" : "--map-active");
      const m = L.marker([c.latitude, c.longitude], {
        draggable: true, title: `${c.name} — arraste para corrigir a posição`,
        icon: L.divIcon({ className: "", iconSize: [12, 12], html: `<div style="width:12px;height:12px;border-radius:999px;background:${fill};border:1px solid ${cssVar("--card")}"></div>` }),
      });
      m.on("dragend", () => { const p = m.getLatLng(); cb.current.onCustomerMove(c.id, p.lat, p.lng); });
      m.addTo(layer);
      bounds.extend([c.latitude, c.longitude]);
    }
    for (const n of nodes) {
      const selected = n.id === selectedId;
      const size = (n.node_type === "olt" ? 30 : n.node_type === "ceo" ? 26 : 24) + (selected ? 6 : 0);
      const radius = n.node_type === "cto" ? "999px" : "4px";
      const m = L.marker([n.latitude, n.longitude], {
        title: n.name, zIndexOffset: selected ? 1000 : 500,
        icon: L.divIcon({ className: "", iconSize: [size, size], html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius};background:${cssVar(`--ftth-${n.node_type}`)};border:${selected ? 3 : 2}px solid ${selected ? cssVar("--foreground") : cssVar("--card")};color:${cssVar("--foreground")};font:800 9px Manrope,sans-serif">${n.node_type.toUpperCase()}</div>` }),
      });
      m.on("click", (e) => { stop(e); cb.current.onSelect(n.id); });
      m.addTo(layer);
      bounds.extend([n.latitude, n.longitude]);
    }
    if (!fitted.current && (nodes.length || customers.length)) {
      fitted.current = true;
      if (nodes.length + customers.length === 1) map.setView(bounds.getCenter(), 16);
      else map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [nodes, customers, selectedId, ready]);

  useEffect(() => {
    const n = nodes.find((x) => x.id === selectedId);
    if (n && mapRef.current) { const map = mapRef.current; if (map.getZoom() < 14 || !map.getBounds().contains([n.latitude, n.longitude])) map.setView([n.latitude, n.longitude], Math.max(map.getZoom(), 16)); else map.panTo([n.latitude, n.longitude]); }
  }, [selectedId]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return (
    <div className="relative isolate h-full min-h-[520px] w-full">
      <div ref={hostRef} className="h-full w-full" aria-label="Mapa da rede FTTH" />
      <div className="absolute left-3 top-3 z-[1000]"><CitySearch nodes={nodes} onNode={(id) => { const n = nodes.find((x) => x.id === id); if (n) mapRef.current?.setView([n.latitude, n.longitude], 17); onFindNode?.(id); }} onGo={(result) => {
        const map = mapRef.current;
        if (!map) return;
        if (result.viewport) map.fitBounds([[result.viewport.southwest.lat, result.viewport.southwest.lng], [result.viewport.northeast.lat, result.viewport.northeast.lng]]);
        else map.setView([result.latitude, result.longitude], 14);
      }} /></div>
    </div>
  );
}

function CitySearch({ onGo, nodes, onNode }: { onGo: (result: PlaceResult) => void; nodes: FtthNode[]; onNode: (id: string) => void }) {
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); setOpen(false); setError(""); return; }
    if (q.length < 3) { setResults([]); setOpen(true); setError(""); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await geocodePlaceQuery({ data: { query: q } });
        setResults(found);
        setOpen(true);
        setError(found.length ? "" : "Nada encontrado. Tente com cidade e estado (ex.: Sorocaba, SP).");
      } catch (e: unknown) {
        setResults([]); setOpen(false);
        setError(e instanceof Error ? e.message : "Falha na busca.");
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const q = norm(query.trim());
  const localHits = q ? nodes.filter((n) => norm(n.name).includes(q) || norm(n.notes ?? "").includes(q)).sort((a, b) => (a.node_type === "olt" ? 0 : 1) - (b.node_type === "olt" ? 0 : 1)).slice(0, 8) : [];
  return <div className="w-72 max-w-[calc(100vw-2rem)]">
    <div className="flex items-center gap-2 border bg-card/95 px-3 py-2 shadow backdrop-blur-sm">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder="Buscar OLT, caixa, cidade ou endereço"
        aria-label="Buscar cidade ou endereço no mapa"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
    </div>
    {error && localHits.length === 0 && <p className="mt-1 border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur-sm">{error}</p>}
    {open && (localHits.length > 0 || results.length > 0) && <div className="mt-1 max-h-72 overflow-y-auto border bg-card/95 shadow backdrop-blur-sm">
      {localHits.length > 0 && <p className="px-3 pt-2 text-[10px] font-bold uppercase text-muted-foreground">Minha rede</p>}
      {localHits.map((n) => <button key={n.id} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setOpen(false); onNode(n.id); }}>
        <span className={`h-2.5 w-2.5 shrink-0 bg-ftth-${n.node_type} ${n.node_type === "cto" ? "rounded-full" : ""}`} /><span className="font-semibold">{n.name}</span><span className="ml-auto text-xs text-muted-foreground">{n.node_type.toUpperCase()}</span>
      </button>)}
      {results.length > 0 && <p className="px-3 pt-2 text-[10px] font-bold uppercase text-muted-foreground">Cidades e endereços</p>}
      {results.map((r) => (
        <button key={`${r.latitude},${r.longitude},${r.description}`} type="button"
          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
          onClick={() => { setOpen(false); onGo(r); }}>
          {r.description}
        </button>
      ))}
    </div>}
  </div>;
}
