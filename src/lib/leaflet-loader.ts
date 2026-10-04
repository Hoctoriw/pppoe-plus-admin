// Browser-only Leaflet loader (OpenStreetMap/Esri tiles, no API key or referer restriction).
let promise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (promise) return promise;
  promise = (async () => {
    await import("leaflet/dist/leaflet.css");
    const mod: any = await import("leaflet");
    return mod.default ?? mod;
  })();
  return promise;
}

export function addBaseLayers(L: any, map: any) {
  const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap",
  });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "&copy; Esri",
  });
  streets.addTo(map);
  L.control.layers({ Mapa: streets, "Satélite": satellite }, undefined, { position: "topright" }).addTo(map);
}

export function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function dotIcon(L: any, opts: { fill: string; stroke: string; size: number; strokeWidth?: number; label?: string; square?: boolean; textColor?: string }) {
  const s = opts.size;
  const html = `<div style="width:${s}px;height:${s}px;background:${opts.fill};border:${opts.strokeWidth ?? 2}px solid ${opts.stroke};border-radius:${opts.square ? "3px" : "50%"};display:flex;align-items:center;justify-content:center;font:700 9px sans-serif;color:${opts.textColor ?? "#fff"};box-sizing:border-box;white-space:nowrap">${opts.label ?? ""}</div>`;
  return L.divIcon({ html, className: "", iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}
