import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  outputDir: "artifacts/playwright",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1420",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
});
