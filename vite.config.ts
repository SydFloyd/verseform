import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { verseformDefines } from "./build-definitions.ts";

export default defineConfig({
  plugins: [react()],
  define: verseformDefines,
  base: "./",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});
