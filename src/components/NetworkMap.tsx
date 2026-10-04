import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { addBaseLayers, cssColor, dotIcon, loadLeaflet } from "@/lib/leaflet-loader";
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
};

export function NetworkMap({ nodes, customers, selectedId, placing, onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const cb = useRef({ onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove });
  const fitted = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  cb.current = { onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove };

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, { zoomControl: false }).setView([-14.235, -51.9253], 4);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      addBaseLayers(L, map);
      map.on("click", (e: any) => cb.current.onMapClick(e.latlng.lat, e.latlng.lng));
      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L; mapRef.current = map;
      setReady(true);
    }).catch(() => setError("Mapa indisponível."));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (el) el.style.cursor = placing ? "crosshair" : "";
    const c = mapRef.current?.getContainer?.();
    if (c) c.style.cursor = placing ? "crosshair" : "";
  }, [placing, ready]);

  useEffect(() => {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pts: [number, number][] = [];
    const card = cssColor("--card"), fg = cssColor("--foreground");

    for (const n of nodes) {
      const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
      if (!parent) continue;
      const anchors = n.cable_anchors ?? [];
      const path: [number, number][] = [[parent.latitude, parent.longitude], ...anchors.map((a) => [a.latitude, a.longitude] as [number, number]), [n.latitude, n.longitude]];
      const pc = cssColor(`--ftth-${parent.node_type}`);
      L.polyline(path, { color: pc, opacity: 0.9, weight: n.id === selectedId ? 6 : 4 }).on("click", (e: any) => { L.DomEvent.stopPropagation(e); cb.current.onSelect(n.id); }).addTo(layer);
      const middle = path[Math.floor(path.length / 2)];
      if (middle) L.marker(middle, { interactive: false, icon: dotIcon(L, { fill: card, stroke: pc, size: 20, label: `F${n.cable_fiber_number ?? 1}`, textColor: fg }) }).addTo(layer);
      if (n.id === selectedId) anchors.forEach((anchor, index) => {
        const slack = Number(anchor.slack_m ?? 0);
        const m = L.marker([anchor.latitude, anchor.longitude], {
          draggable: true, zIndexOffset: 3000,
          title: slack > 0 ? `Ancoragem ${index + 1} · reserva de ${slack} m` : `Ancoragem ${index + 1}`,
          icon: dotIcon(L, { fill: cssColor(slack > 0 ? "--ftth-ceo" : "--primary"), stroke: card, size: slack > 0 ? 30 : 18, label: slack > 0 ? `${index + 1}·${slack}m` : String(index + 1), textColor: cssColor("--primary-foreground") }),
        }).addTo(layer);
        m.on("click", () => cb.current.onAnchorSelect(index));
        m.on("dragend", () => { const p = m.getLatLng(); cb.current.onAnchorMove(index, { latitude: p.lat, longitude: p.lng, slack_m: anchor.slack_m ?? 0 }); });
      });
    }
    for (const c of customers) {
      const cto = c.cto_id ? byId.get(c.cto_id) : undefined;
      if (cto) L.polyline([[cto.latitude, cto.longitude], [c.latitude, c.longitude]], { color: cssColor("--muted-foreground"), weight: 2, dashArray: "4 6", opacity: 0.8, interactive: false }).addTo(layer);
      const m = L.marker([c.latitude, c.longitude], { draggable: true, title: `${c.name} — arraste para corrigir a posição`, icon: dotIcon(L, { fill: cssColor(c.weak ? "--map-suspended" : "--map-active"), stroke: card, size: 12, strokeWidth: 1 }) }).addTo(layer);
      m.on("dragend", () => { const p = m.getLatLng(); cb.current.onCustomerMove(c.id, p.lat, p.lng); });
      pts.push([c.latitude, c.longitude]);
    }
    for (const n of nodes) {
      const selected = n.id === selectedId;
      const base = n.node_type === "olt" ? 30 : n.node_type === "ceo" ? 28 : 26;
      const m = L.marker([n.latitude, n.longitude], {
        title: n.name, zIndexOffset: selected ? 2000 : 1000,
        icon: dotIcon(L, { fill: cssColor(`--ftth-${n.node_type}`), stroke: selected ? fg : card, strokeWidth: selected ? 3 : 2, size: selected ? base + 6 : base, square: n.node_type !== "cto", label: n.node_type.toUpperCase() }),
      }).addTo(layer);
      m.on("click", () => cb.current.onSelect(n.id));
      pts.push([n.latitude, n.longitude]);
    }
    if (!fitted.current && pts.length) {
      fitted.current = true;
      if (pts.length === 1) map.setView(pts[0], 16);
      else map.fitBounds(pts, { padding: [60, 60] });
    }
  }, [nodes, customers, selectedId, ready]);

  useEffect(() => {
    const n = nodes.find((x) => x.id === selectedId);
    if (n && mapRef.current) mapRef.current.panTo([n.latitude, n.longitude]);
  }, [selectedId]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return (
    <div className="relative h-full min-h-[520px] w-full">
      <div ref={hostRef} className="z-0 h-full w-full" aria-label="Mapa da rede FTTH" />
      <div className="absolute left-3 top-3 z-[1000]"><CitySearch onGo={(result) => {
        const map = mapRef.current;
        if (!map) return;
        if (result.viewport) map.fitBounds([[result.viewport.southwest.lat, result.viewport.southwest.lng], [result.viewport.northeast.lat, result.viewport.northeast.lng]]);
        else map.setView([result.latitude, result.longitude], 14);
      }} /></div>
    </div>
  );
}

function CitySearch({ onGo }: { onGo: (result: PlaceResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); setOpen(false); setError(""); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await geocodePlaceQuery({ data: { query: q } });
        setResults(found);
        setOpen(found.length > 0);
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

  return <div className="w-72 max-w-[calc(100vw-2rem)]">
    <div className="flex items-center gap-2 border bg-card/95 px-3 py-2 shadow backdrop-blur-sm">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder="Buscar cidade ou endereço"
        aria-label="Buscar cidade ou endereço no mapa"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
    </div>
    {error && !open && <p className="mt-1 border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur-sm">{error}</p>}
    {open && <div className="mt-1 max-h-64 overflow-y-auto border bg-card/95 shadow backdrop-blur-sm">
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
