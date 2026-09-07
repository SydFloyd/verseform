import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test.skipIf(process.platform !== "win32")("installer readiness waits for cold startup and cleans up failed launches", () => {
  const output = execFileSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    fileURLToPath(new URL("./installer-readiness.ps1", import.meta.url)),
  ], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  expect(output).toContain("Installer readiness passed:");
});
