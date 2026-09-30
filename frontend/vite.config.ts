import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 850, // only the map library's own chunk is this large, and it is fetched on demand
    rollupOptions: {
      output: {
        // vendor code in its own chunks so a deploy that only touches our screens leaves them cached in the browser
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("react-router")) return "router";
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react";
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], globals: true },
});
