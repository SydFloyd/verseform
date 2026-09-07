import { readFile, readdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("the deployable bundle contains only production authority and a complete offline manifest", async () => {
  const files = await readdir("dist-web/assets");
  const scripts = await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => readFile(`dist-web/assets/${file}`, "utf8")));
  const code = scripts.join("\n");
  expect(code).not.toMatch(/__VERSEFORM_DIAGNOSTICS__|__TAURI_INTERNALS__|verseform:fake-provider-request|browser:\/\/documents|lookupDelay/);
  expect(code).toContain("https://arc.dbs.org/api/bible-text/");
  const worker = await readFile("dist-web/sw.js", "utf8");
  expect(worker).toContain('"/index.html"');
  expect(worker).not.toContain("skipWaiting");
  for (const file of files) expect(worker).toContain(`/assets/${file}`);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  expect(config.outputDirectory).toBe("dist-web");
  expect(config.buildCommand).toBe("npm run build:web");
});
