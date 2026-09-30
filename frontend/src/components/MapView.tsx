import { lazy, Suspense } from "react";
import type { FacilityDot } from "../api";

export interface MapViewProps { dots: FacilityDot[]; onSelect?: (f: FacilityDot) => void; center?: [number, number]; line?: [number, number][] }

// MapLibre (about 800 kB of code plus its stylesheet) is fetched the first time a map is on screen, not with the app.
const MapInner = lazy(() => import("./MapInner"));

/** Facility or district dots on an OpenStreetMap base. The box keeps its size while the map code loads so nothing shifts. */
export default function MapView(props: MapViewProps) {
  return <Suspense fallback={<div className="skeleton map" aria-busy="true" />}><MapInner {...props} /></Suspense>;
}
