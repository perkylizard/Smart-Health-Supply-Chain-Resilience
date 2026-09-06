import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { FacilityDot } from "../api";

const colour: Record<string, string> = { red: "#c8372d", amber: "#c77c11", watch: "#2e7d5b", ok: "#2e7d5b", data_issue: "#3b6fb6" };

export default function MapView({ dots, onSelect, center, line }: { dots: FacilityDot[]; onSelect?: (f: FacilityDot) => void; center?: [number, number]; line?: [number, number][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!ref.current || map.current) return;
    map.current = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
      center: center ?? [85.1, 25.6], zoom: 9,
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const draw = () => {
      const fc = { type: "FeatureCollection" as const, features: dots.map((d) => ({ type: "Feature" as const, properties: { ...d, colour: colour[d.worst_severity] ?? colour.ok, r: d.type === "DH" ? 9 : d.type === "CHC" ? 7 : 5 }, geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] } })) };
      const src = m.getSource("dots") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc); else {
        m.addSource("dots", { type: "geojson", data: fc });
        m.addLayer({ id: "dots", type: "circle", source: "dots", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "colour"], "circle-stroke-width": 1.5, "circle-stroke-color": "#fbf8f2", "circle-opacity": 0.9 } });
        m.on("click", "dots", (e) => { const p = e.features?.[0]?.properties as unknown as FacilityDot; if (p && onSelect) onSelect(p); });
        m.on("mouseenter", "dots", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "dots", () => { m.getCanvas().style.cursor = ""; });
      }
      const ls = m.getSource("line") as maplibregl.GeoJSONSource | undefined;
      const lf = { type: "FeatureCollection" as const, features: line ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }] : [] };
      if (ls) ls.setData(lf); else { m.addSource("line", { type: "geojson", data: lf }); m.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": "#0f6e6e", "line-width": 3, "line-dasharray": [2, 1] } }); }
      if (dots.length) {
        const b = new maplibregl.LngLatBounds();
        dots.forEach((d) => b.extend([d.lon, d.lat]));
        m.fitBounds(b, { padding: 30, maxZoom: 11, duration: 0 });
      }
    };
    if (m.isStyleLoaded()) draw(); else m.once("load", draw);
  }, [dots, line, onSelect]);
  return <div className="map" ref={ref} />;
}
