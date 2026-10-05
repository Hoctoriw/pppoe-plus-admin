import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

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

let leafletPromise: Promise<typeof import("leaflet")> | null = null;

/** Carrega o Leaflet (OpenStreetMap) só no navegador. */
export function loadMaps(): Promise<typeof import("leaflet")> {
  if (!leafletPromise) {
    leafletPromise = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([m]) => ((m as any).default ?? m) as typeof import("leaflet"));
  }
  return leafletPromise;
}

export function addBaseLayers(L: typeof import("leaflet"), map: import("leaflet").Map) {
  const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap",
  });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "Imagens &copy; Esri",
  });
  streets.addTo(map);
  L.control.layers({ "Ruas": streets, "Satélite": satellite }, undefined, { position: "topright" }).addTo(map);
}

export function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function ConnectionsMap({ points, selectedId, onSelect, onMoveSelected }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const callbacksRef = useRef({ onSelect, onMoveSelected, selectedId });
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  callbacksRef.current = { onSelect, onMoveSelected, selectedId };

  useEffect(() => {
    let cancelled = false;
    void loadMaps().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;
      const map = L.map(hostRef.current, { center: [-14.235, -51.9253], zoom: 4 });
      addBaseLayers(L, map);
      map.on("click", (e) => {
        if (!callbacksRef.current.selectedId) return;
        callbacksRef.current.onMoveSelected(e.latlng.lat, e.latlng.lng);
      });
      LRef.current = L;
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Mapa indisponível."));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (!points.length) return;
    const bounds = L.latLngBounds([]);
    for (const point of points) {
      const selected = point.id === selectedId;
      const color = cssVar(`--map-${point.status}`);
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: selected ? 11 : 8, color: selected ? cssVar("--foreground") : color, weight: selected ? 4 : 2, fillColor: color, fillOpacity: 1,
      }).bindTooltip(point.name);
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); callbacksRef.current.onSelect(point.id); });
      marker.addTo(layer);
      bounds.extend([point.latitude, point.longitude]);
    }
    if (selectedId) {
      const point = points.find((item) => item.id === selectedId);
      if (point) map.setView([point.latitude, point.longitude], 17);
    } else if (points.length === 1) {
      const p = points[0]!;
      map.setView([p.latitude, p.longitude], 16);
    } else {
      map.fitBounds(bounds, { padding: [52, 52] });
    }
  }, [points, selectedId, mapReady]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return <div ref={hostRef} className="h-full min-h-96 w-full" aria-label="Mapa de residências dos clientes" />;
}