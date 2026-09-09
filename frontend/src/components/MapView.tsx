import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { FacilityDot } from "../api";

const colour: Record<string, string> = { red: "#c8372d", amber: "#c77c11", watch: "#2e7d5b", ok: "#2e7d5b", data_issue: "#3b6fb6" };

/** Facility or district dots on an OpenStreetMap base. Robust to data arriving before or after the style loads. */
export default function MapView({ dots, onSelect, center, line }: { dots: FacilityDot[]; onSelect?: (f: FacilityDot) => void; center?: [number, number]; line?: [number, number][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const latest = useRef({ dots, line, onSelect });
  latest.current = { dots, line, onSelect };

  const draw = () => {
    const m = map.current; if (!m || !loaded.current) return;
    const { dots, line } = latest.current;
    const valid = dots.filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lon));
    const fc = { type: "FeatureCollection" as const, features: valid.map((d) => ({ type: "Feature" as const, properties: { ...d, colour: colour[d.worst_severity] ?? colour.ok, r: d.type === "DH" ? 9 : d.type === "CHC" ? 7 : 5 }, geometry: { type: "Point" as const, coordinates: [d.lon, d.lat] } })) };
    const src = m.getSource("dots") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(fc); else {
      m.addSource("dots", { type: "geojson", data: fc });
      m.addLayer({ id: "dots", type: "circle", source: "dots", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "colour"], "circle-stroke-width": 1.5, "circle-stroke-color": "#fbf8f2", "circle-opacity": 0.9 } });
      m.on("click", "dots", (e) => { const p = e.features?.[0]?.properties as unknown as FacilityDot; if (p && latest.current.onSelect) latest.current.onSelect(p); });
      m.on("mouseenter", "dots", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "dots", () => { m.getCanvas().style.cursor = ""; });
    }
    const lf = { type: "FeatureCollection" as const, features: line ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }] : [] };
    const ls = m.getSource("line") as maplibregl.GeoJSONSource | undefined;
    if (ls) ls.setData(lf); else { m.addSource("line", { type: "geojson", data: lf }); m.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": "#0f6e6e", "line-width": 3, "line-dasharray": [2, 1] } }); }
    if (valid.length) {
      const b = new maplibregl.LngLatBounds();
      valid.forEach((d) => b.extend([d.lon, d.lat]));
      m.fitBounds(b, { padding: 30, maxZoom: 11, duration: 0 });
    }
  };

  useEffect(() => {
    let cancelled = false;
    // create the map one frame later: creating it synchronously in the page's first commit can leave the style never loading
    const raf = requestAnimationFrame(() => {
    if (cancelled || !ref.current || map.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
      center: center ?? [85.1, 25.6], zoom: 6,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => { loaded.current = true; draw(); });
    map.current = m;
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); if (map.current) { map.current.remove(); map.current = null; loaded.current = false; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { draw(); }, [dots, line]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="map" ref={ref} />;
}
