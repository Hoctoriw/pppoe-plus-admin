import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadMaps } from "@/components/ConnectionsMap";
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
};

export function NetworkMap({ nodes, customers, selectedId, placing, onSelect, onMapClick, onAnchorSelect, onAnchorMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const shapesRef = useRef<any[]>([]);
  const cb = useRef({ onSelect, onMapClick, onAnchorSelect, onAnchorMove });
  const fitted = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  cb.current = { onSelect, onMapClick, onAnchorSelect, onAnchorMove };

  useEffect(() => {
    let cancelled = false;
    loadMaps().then((maps) => {
      if (cancelled || !hostRef.current) return;
      const map = new maps.Map(hostRef.current, {
        center: { lat: -14.235, lng: -51.9253 }, zoom: 4,
        mapTypeControl: true, streetViewControl: false, clickableIcons: false,
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
      if (n.id === selectedId) anchors.forEach((anchor, index) => {
        const marker = new maps.Marker({
          map, position: { lat: anchor.latitude, lng: anchor.longitude }, draggable: true,
          title: `Ancoragem ${index + 1}`, zIndex: 30,
          label: { text: String(index + 1), color: color("--primary-foreground"), fontSize: "10px", fontWeight: "700" },
          icon: { path: maps.SymbolPath.CIRCLE, fillColor: color("--primary"), fillOpacity: 1, strokeColor: color("--card"), strokeWeight: 2, scale: 8 },
        });
        marker.addListener("click", () => cb.current.onAnchorSelect(index));
        marker.addListener("dragend", (event: any) => {
          if (event.latLng) cb.current.onAnchorMove(index, { latitude: event.latLng.lat(), longitude: event.latLng.lng() });
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
      shapesRef.current.push(new maps.Marker({
        map, position: { lat: c.latitude, lng: c.longitude }, title: c.name, zIndex: 1,
        icon: { path: maps.SymbolPath.CIRCLE, fillColor: color(c.weak ? "--map-suspended" : "--map-active"), fillOpacity: 1, strokeColor: color("--card"), strokeWeight: 1, scale: 5 },
      }));
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
  return <div ref={hostRef} className="h-full min-h-[520px] w-full" aria-label="Mapa da rede FTTH" />;
}
