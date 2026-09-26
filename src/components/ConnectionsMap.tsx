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

type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => any;
  Marker: new (options: Record<string, unknown>) => any;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
  SymbolPath: { CIRCLE: unknown };
};

declare global {
  interface Window {
    google?: { maps: GoogleMaps };
    initNexoraConnectionsMap?: () => void;
  }
}

let mapsPromise: Promise<GoogleMaps> | null = null;

function loadMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as string | undefined;
    if (!key) { reject(new Error("Mapa indisponível: conexão do Google Maps não encontrada.")); return; }
    window.initNexoraConnectionsMap = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("O mapa não pôde ser carregado."));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=initNexoraConnectionsMap&channel=${encodeURIComponent(channel ?? "nexora-connections")}`;
    script.async = true;
    script.onerror = () => reject(new Error("O mapa não pôde ser carregado."));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export function ConnectionsMap({ points, selectedId, onSelect, onMoveSelected }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const callbacksRef = useRef({ onSelect, onMoveSelected, selectedId });
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  callbacksRef.current = { onSelect, onMoveSelected, selectedId };

  useEffect(() => {
    let cancelled = false;
    void loadMaps().then((maps) => {
      if (cancelled || !hostRef.current) return;
      const initial = points[0] ? { lat: points[0].latitude, lng: points[0].longitude } : { lat: -14.235, lng: -51.9253 };
      const map = new maps.Map(hostRef.current, {
        center: initial,
        zoom: points.length ? 13 : 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      map.addListener("click", (event: { latLng?: { lat: () => number; lng: () => number } }) => {
        if (!callbacksRef.current.selectedId || !event.latLng) return;
        callbacksRef.current.onMoveSelected(event.latLng.lat(), event.latLng.lng());
      });
      mapRef.current = map;
      setMapReady(true);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Mapa indisponível."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    if (!points.length) return;
    const bounds = new maps.LatLngBounds();
    for (const point of points) {
      const selected = point.id === selectedId;
      const rootStyle = getComputedStyle(document.documentElement);
      const color = rootStyle.getPropertyValue(`--map-${point.status}`).trim();
      const selectedStroke = rootStyle.getPropertyValue("--card").trim();
      const marker = new maps.Marker({
        map,
        position: { lat: point.latitude, lng: point.longitude },
        title: point.name,
        zIndex: selected ? 10 : 1,
        icon: { path: maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: selected ? selectedStroke : color, strokeWeight: selected ? 4 : 2, scale: selected ? 11 : 8 },
      });
      marker.addListener("click", () => callbacksRef.current.onSelect(point.id));
      markersRef.current.push(marker);
      bounds.extend({ lat: point.latitude, lng: point.longitude });
    }
    if (selectedId) {
      const point = points.find((item) => item.id === selectedId);
      if (point) { map.panTo({ lat: point.latitude, lng: point.longitude }); map.setZoom(17); }
    } else if (points.length === 1) {
      map.setCenter({ lat: points[0].latitude, lng: points[0].longitude }); map.setZoom(16);
    } else {
      map.fitBounds(bounds, 52);
    }
  }, [points, selectedId, mapReady]);

  if (error) return <div className="flex h-full min-h-96 items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground"><div><MapPin className="mx-auto mb-3 h-8 w-8" /><p>{error}</p></div></div>;
  return <div ref={hostRef} className="h-full min-h-96 w-full" aria-label="Mapa de residências dos clientes" />;
}