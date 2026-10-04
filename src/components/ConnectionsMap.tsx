import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { addBaseLayers, cssColor, dotIcon, loadLeaflet } from "@/lib/leaflet-loader";

type Point = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: "active" | "suspended" | "pending" | "cancelled";
};

type Props = {
  points: Point[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveSelected: (latitude: number, longitude: number) => void;
};

export function ConnectionsMap({ points, selectedId, onSelect, onMoveSelected }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const callbacksRef = useRef({ onSelect, onMoveSelected, selectedId });
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  callbacksRef.current = { onSelect, onMoveSelected, selectedId };

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current).setView([-14.235, -51.9253], 4);
      addBaseLayers(L, map);
      map.on("click", (e: any) => {
        if (!callbacksRef.current.selectedId) return;
        callbacksRef.current.onMoveSelected(e.latlng.lat, e.latlng.lng);
      });
      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L; mapRef.current = map;
      setMapReady(true);
    }).catch(() => setError("Mapa indisponível."));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (!points.length) return;
    const card = cssColor("--card");
    for (const point of points) {
      const selected = point.id === selectedId;
      const color = cssColor(`--map-${point.status}`);
      L.marker([point.latitude, point.longitude], {
        title: point.name, zIndexOffset: selected ? 1000 : 0,
        icon: dotIcon(L, { fill: color, stroke: selected ? card : color, strokeWidth: selected ? 4 : 2, size: selected ? 24 : 16 }),
      }).on("click", () => callbacksRef.current.onSelect(point.id)).addTo(layer);
    }
    const sel = selectedId ? points.find((p) => p.id === selectedId) : undefined;
    if (sel) map.setView([sel.latitude, sel.longitude], 17);
    else if (points.length === 1) map.setView([points[0]!.latitude, points[0]!.longitude], 16);
    else map.fitBounds(points.map((p) => [p.latitude, p.longitude]), { padding: [52, 52] });
  }, [points, selectedId, mapReady]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return <div ref={hostRef} className="z-0 h-full min-h-96 w-full" aria-label="Mapa de residências dos clientes" />;
}
