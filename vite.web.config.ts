import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { verseformDefines } from "./build-definitions.ts";

function offlineApplication(): Plugin {
  return {
    name: "verseform-offline-application",
    generateBundle(_options, bundle) {
      const files = [...new Set(["index.html", ...Object.keys(bundle).filter((file) => !file.endsWith(".map"))])].sort();
      const digest = createHash("sha256");
      for (const file of files) {
        const asset = bundle[file];
        digest.update(!asset ? readFileSync(new URL("./web/index.html", import.meta.url)) : asset.type === "chunk" ? asset.code : asset.source);
      }
      const cacheName = `verseform-app-${digest.digest("hex").slice(0, 16)}`;
      this.emitFile({ type: "asset", fileName: "sw.js", source: `
const CACHE = ${JSON.stringify(cacheName)};
const FILES = ${JSON.stringify(files.map((file) => `/${file}`))};
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith("verseform-app-") && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = event.request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html") ? "/index.html" : url.pathname;
  if (!FILES.includes(path)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(path)) || fetch(event.request)));
});
` });
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, "web"),
  plugins: [react(), offlineApplication()],
  define: verseformDefines,
  build: { outDir: resolve(import.meta.dirname, "dist-web"), emptyOutDir: true },
  server: { host: "127.0.0.1", port: 1430, strictPort: true, fs: { allow: [import.meta.dirname] } },
  preview: { host: "127.0.0.1", port: 1431, strictPort: true },
});
