import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { FacilityDot } from "../api";

const colour: Record<string, string> = { red: "#c62828", amber: "#b26a00", watch: "#2e7d32", ok: "#2e7d32", data_issue: "#1565c0" };

/** Facility or district dots on an OpenStreetMap base. Created once the container has a size; draws on load and on data
 * changes. Note for anyone testing with automation: MapLibre paints on requestAnimationFrame, so a hidden browser tab
 * shows a blank map until it is brought to the front. */
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
      m.addLayer({ id: "dots", type: "circle", source: "dots", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "colour"], "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff", "circle-opacity": 0.9 } });
      m.on("click", "dots", (e) => { const p = e.features?.[0]?.properties as unknown as FacilityDot; if (p && latest.current.onSelect) latest.current.onSelect(p); });
      m.on("mousemove", "dots", (e) => { const p = e.features?.[0]?.properties as unknown as FacilityDot | undefined; const c = m.getCanvas(); c.style.cursor = "pointer"; c.title = p ? p.facility_name : ""; });
      m.on("mouseleave", "dots", () => { const c = m.getCanvas(); c.style.cursor = ""; c.title = ""; });
    }
    const lf = { type: "FeatureCollection" as const, features: line ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } }] : [] };
    const ls = m.getSource("line") as maplibregl.GeoJSONSource | undefined;
    if (ls) ls.setData(lf); else { m.addSource("line", { type: "geojson", data: lf }); m.addLayer({ id: "line", type: "line", source: "line", paint: { "line-color": "#1f3b73", "line-width": 3, "line-dasharray": [2, 1] } }); }
    if (valid.length) {
      const b = new maplibregl.LngLatBounds();
      valid.forEach((d) => b.extend([d.lon, d.lat]));
      m.resize();
      m.fitBounds(b, { padding: 32, maxZoom: 11, animate: false });
    }
  };

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let m: maplibregl.Map | null = null;
    let tries = 0;
    let timer = 0;
    const create = () => {
      if (map.current) return;
      if (el.clientWidth < 50 || el.clientHeight < 50) { if (tries++ < 40) timer = window.setTimeout(create, 50); return; }
      m = new maplibregl.Map({
        container: el,
        style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
        center: center ?? [85.1, 25.6], zoom: 6,
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.on("load", () => { loaded.current = true; m?.resize(); draw(); });
      map.current = m;
    };
    timer = window.setTimeout(create, 30);
    return () => { window.clearTimeout(timer); if (map.current) { map.current.remove(); map.current = null; loaded.current = false; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { draw(); }, [dots, line]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the canvas matched to its card: layouts settle after the map loads (fonts, grids, sheets opening)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { map.current?.resize(); });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <div className="map" ref={ref} />;
}
