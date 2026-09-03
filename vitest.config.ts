import { defineConfig } from "vitest/config";
import { verseformDefines } from "./build-definitions.ts";

export default defineConfig({
  define: verseformDefines,
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/browser/**"],
  },
});
