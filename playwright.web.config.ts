import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web",
  globalSetup: "./tests/web/global-setup.ts",
  outputDir: "artifacts/playwright-web",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:1440", channel: "msedge", headless: true, trace: "retain-on-failure" },
});
