import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { loadMaps } from "@/components/ConnectionsMap";
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
  const shapesRef = useRef<any[]>([]);
  const cb = useRef({ onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove });
  const fitted = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  cb.current = { onSelect, onMapClick, onAnchorSelect, onAnchorMove, onCustomerMove };

  useEffect(() => {
    let cancelled = false;
    loadMaps().then((maps) => {
      if (cancelled || !hostRef.current) return;
      const map = new maps.Map(hostRef.current, {
        center: { lat: -14.235, lng: -51.9253 }, zoom: 4,
        mapTypeControl: true, streetViewControl: false, clickableIcons: false,
        zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      map.addListener("click", (e: any) => { if (e.latLng) cb.current.onMapClick(e.latLng.lat(), e.latLng.lng()); });
      mapRef.current = map;
      setReady(true);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Mapa indisponível."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.setOptions({ draggableCursor: placing ? "crosshair" : null });
  }, [placing, ready]);

  useEffect(() => {
    const maps = (window as any).google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;
    shapesRef.current.forEach((s) => s.setMap(null));
    shapesRef.current = [];
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const bounds = new maps.LatLngBounds();

    for (const n of nodes) {
      const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
      if (!parent) continue;
      const anchors = n.cable_anchors ?? [];
      const line = new maps.Polyline({
        map, path: [{ lat: parent.latitude, lng: parent.longitude }, ...anchors.map((a) => ({ lat: a.latitude, lng: a.longitude })), { lat: n.latitude, lng: n.longitude }],
        strokeColor: color(`--ftth-${parent.node_type}`), strokeOpacity: 0.9, strokeWeight: n.id === selectedId ? 6 : 4,
      });
      line.addListener("click", () => cb.current.onSelect(n.id));
      shapesRef.current.push(line);
      const path = [{ lat: parent.latitude, lng: parent.longitude }, ...anchors.map((a) => ({ lat: a.latitude, lng: a.longitude })), { lat: n.latitude, lng: n.longitude }];
      const middle = path[Math.floor(path.length / 2)];
      if (middle) {
        shapesRef.current.push(new maps.Marker({
          map, position: middle, clickable: false, zIndex: 5,
          label: { text: `F${n.cable_fiber_number ?? 1}`, color: color("--foreground"), fontSize: "10px", fontWeight: "700" },
          icon: { path: maps.SymbolPath.CIRCLE, fillColor: color("--card"), fillOpacity: 0.95, strokeColor: color(`--ftth-${parent.node_type}`), strokeWeight: 2, scale: 10 },
        }));
      }
      if (n.id === selectedId) anchors.forEach((anchor, index) => {
        const slack = Number(anchor.slack_m ?? 0);
        const marker = new maps.Marker({
          map, position: { lat: anchor.latitude, lng: anchor.longitude }, draggable: true,
          title: slack > 0 ? `Ancoragem ${index + 1} · reserva de ${slack} m` : `Ancoragem ${index + 1}`,
          zIndex: 30,
          label: { text: slack > 0 ? `${index + 1}·${slack}m` : String(index + 1), color: color("--primary-foreground"), fontSize: "10px", fontWeight: "700" },
          icon: { path: maps.SymbolPath.CIRCLE, fillColor: color(slack > 0 ? "--ftth-ceo" : "--primary"), fillOpacity: 1, strokeColor: color("--card"), strokeWeight: 2, scale: slack > 0 ? 11 : 8 },
        });
        marker.addListener("click", () => cb.current.onAnchorSelect(index));
        marker.addListener("dragend", (event: any) => {
          if (event.latLng) cb.current.onAnchorMove(index, { latitude: event.latLng.lat(), longitude: event.latLng.lng(), slack_m: anchor.slack_m ?? 0 });
        });

        shapesRef.current.push(marker);
      });
    }
    for (const c of customers) {
      const cto = c.cto_id ? byId.get(c.cto_id) : undefined;
      if (cto) {
        shapesRef.current.push(new maps.Polyline({
          map, path: [{ lat: cto.latitude, lng: cto.longitude }, { lat: c.latitude, lng: c.longitude }],
          strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.8, strokeColor: color("--muted-foreground"), scale: 2 }, offset: "0", repeat: "8px" }],
        }));
      }
      const marker = new maps.Marker({
        map, position: { lat: c.latitude, lng: c.longitude }, title: `${c.name} — arraste para corrigir a posição`, zIndex: 1, draggable: true,
        icon: { path: maps.SymbolPath.CIRCLE, fillColor: color(c.weak ? "--map-suspended" : "--map-active"), fillOpacity: 1, strokeColor: color("--card"), strokeWeight: 1, scale: 5 },
      });
      marker.addListener("dragend", (event: any) => {
        if (event.latLng) cb.current.onCustomerMove(c.id, event.latLng.lat(), event.latLng.lng());
      });
      shapesRef.current.push(marker);
      bounds.extend({ lat: c.latitude, lng: c.longitude });
    }
    for (const n of nodes) {
      const selected = n.id === selectedId;
      const size = n.node_type === "olt" ? 11 : n.node_type === "ceo" ? 9 : 8;
      const marker = new maps.Marker({
        map, position: { lat: n.latitude, lng: n.longitude }, title: n.name, zIndex: selected ? 20 : 10,
        label: { text: n.node_type.toUpperCase(), color: color("--foreground"), fontSize: "10px", fontWeight: "700" },
        icon: {
          path: n.node_type === "cto" ? maps.SymbolPath.CIRCLE : "M -1,-1 1,-1 1,1 -1,1 z",
          fillColor: color(`--ftth-${n.node_type}`), fillOpacity: 1,
          strokeColor: selected ? color("--foreground") : color("--card"), strokeWeight: selected ? 3 : 2,
          scale: selected ? size + 3 : size, labelOrigin: new maps.Point(0, 3),
        },
      });
      marker.addListener("click", () => cb.current.onSelect(n.id));
      shapesRef.current.push(marker);
      bounds.extend({ lat: n.latitude, lng: n.longitude });
    }
    if (!fitted.current && (nodes.length || customers.length)) {
      fitted.current = true;
      if (nodes.length + customers.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(16); }
      else map.fitBounds(bounds, 60);
    }
  }, [nodes, customers, selectedId, ready]);

  useEffect(() => {
    const n = nodes.find((x) => x.id === selectedId);
    if (n && mapRef.current) mapRef.current.panTo({ lat: n.latitude, lng: n.longitude });
  }, [selectedId]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return (
    <div className="relative h-full min-h-[520px] w-full">
      <div ref={hostRef} className="h-full w-full" aria-label="Mapa da rede FTTH" />
      <div className="absolute left-3 top-3 z-10"><CitySearch onGo={(result) => {
        const map = mapRef.current;
        if (!map) return;
        if (result.viewport) map.fitBounds({ east: result.viewport.northeast.lng, north: result.viewport.northeast.lat, south: result.viewport.southwest.lat, west: result.viewport.southwest.lng });
        else { map.panTo({ lat: result.latitude, lng: result.longitude }); map.setZoom(14); }
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
