import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// maplibre-gl touches browser APIs jsdom lacks; the map is not under unit test
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => "";
vi.mock("maplibre-gl", () => ({ default: { Map: class { addControl() {} on() {} once() {} remove() {} isStyleLoaded() { return false; } }, NavigationControl: class {}, LngLatBounds: class { extend() { return this; } } } }));
