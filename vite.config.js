import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        rexNoctis: resolve(root, "fragrances/rex-noctis/index.html"),
        crimsonGrove: resolve(root, "fragrances/crimson-grove/index.html"),
        wildSovereign: resolve(root, "fragrances/wild-sovereign/index.html"),
        sovereignTide: resolve(root, "fragrances/sovereign-tide/index.html"),
        velvetPulse: resolve(root, "fragrances/velvet-pulse/index.html"),
        summerNova: resolve(root, "fragrances/summer-nova/index.html"),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
