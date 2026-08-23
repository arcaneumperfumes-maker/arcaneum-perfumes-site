import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

function analyticsPreviewHarness() {
  const events = [];
  return {
    name: "arcaneum-analytics-preview-harness",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== "/arcaneum-intake" || request.method !== "POST") {
          next();
          return;
        }

        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          try {
            const event = JSON.parse(body);
            if (Object.keys(event).some((key) => key.toLowerCase().includes("ip"))) {
              response.statusCode = 422;
              response.end();
              return;
            }
            events.push(event);
            response.statusCode = 201;
            response.end();
          } catch {
            response.statusCode = 400;
            response.end();
          }
        });
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          injectTo: "head-prepend",
          children:
            `window.__ARCANEUM_ANALYTICS_CONFIG__={endpoint:new URL("/arcaneum-intake",location.origin).href,publishableKey:"preview-test-key"};window.__ARCANEUM_PREVIEW_EVENTS__=${JSON.stringify(events)};`,
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [analyticsPreviewHarness()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        privacy: resolve(root, "privacy.html"),
        rexNoctis: resolve(root, "fragrances/rex-noctis/index.html"),
        vesperGlass: resolve(root, "fragrances/vesper-glass/index.html"),
        wildSovereign: resolve(root, "fragrances/wild-sovereign/index.html"),
        vermillionAire: resolve(root, "fragrances/vermillionaire/index.html"),
        crimsonGrove: resolve(root, "fragrances/crimson-grove/index.html"),
        sovereignTide: resolve(root, "fragrances/sovereign-tide/index.html"),
        velvetPulse: resolve(root, "fragrances/velvet-pulse/index.html"),
        summerNova: resolve(root, "fragrances/summer-nova/index.html"),
        velvetJade: resolve(root, "fragrances/velvet-jade/index.html"),
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
