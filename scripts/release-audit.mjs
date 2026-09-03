import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fail = (message) => { throw new Error(message); };

const tauri = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const capability = JSON.parse(readFileSync(resolve(root, "src-tauri/capabilities/default.json"), "utf8"));
const csp = tauri.app?.security?.csp ?? "";
for (const directive of [
  "default-src 'self'", "script-src 'self'", "object-src 'none'",
  "base-uri 'none'", "form-action 'none'",
]) if (!csp.includes(directive)) fail(`CSP is missing ${directive}`);
if (/https?:\/\//.test(csp.replace("http://ipc.localhost", ""))) {
  fail("The webview CSP must not allow remote origins.");
}
if (JSON.stringify(tauri.app.security.capabilities) !== '["main-capability"]') {
  fail("Only the reviewed main capability may be enabled.");
}
if (
  capability.local !== true || JSON.stringify(capability.windows) !== '["main"]'
  || JSON.stringify(capability.platforms) !== '["windows"]'
  || JSON.stringify(capability.permissions) !== '["core:default","core:window:allow-set-title"]'
) fail("The reviewed capability boundary changed.");

const packages = [];
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path || !entry.version) continue;
  const marker = "node_modules/";
  const name = path.slice(path.lastIndexOf(marker) + marker.length);
  if (!entry.license) fail(`npm package ${name}@${entry.version} has no recorded license`);
  packages.push({ ecosystem: "npm", name, version: entry.version, license: entry.license });
}

const metadata = JSON.parse(execFileSync("cargo", [
  "metadata", "--locked", "--format-version", "1",
  "--manifest-path", resolve(root, "src-tauri/Cargo.toml"),
], { encoding: "utf8", cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }));
for (const entry of metadata.packages) {
  if (!entry.source) continue;
  const license = entry.license ?? (entry.license_file ? `SEE ${entry.license_file}` : undefined);
  if (!license) fail(`Cargo package ${entry.name}@${entry.version} has no recorded license`);
  packages.push({ ecosystem: "Cargo", name: entry.name, version: entry.version, license });
}

for (const entry of packages) {
  if (/AGPL|SSPL|BUSL/i.test(entry.license)) {
    fail(`${entry.ecosystem} package ${entry.name}@${entry.version} uses blocked license ${entry.license}`);
  }
}
packages.sort((left, right) =>
  left.ecosystem.localeCompare(right.ecosystem)
  || left.name.localeCompare(right.name)
  || left.version.localeCompare(right.version));

const notice = [
  "VERSEFORM DEPENDENCY LICENSE INVENTORY",
  "",
  "Generated from package-lock.json and Cargo.lock by npm run audit:release.",
  "This inventory records the SPDX license expression supplied by each dependency.",
  "Complete license texts and source are available in each package distribution recorded by the lockfiles.",
  "",
  ...packages.map((entry) => `${entry.ecosystem}\t${entry.name}@${entry.version}\t${entry.license}`),
  "",
].join("\n");
const noticePath = resolve(root, "DEPENDENCY-LICENSES.txt");
if (process.argv.includes("--write-notices")) writeFileSync(noticePath, notice, "utf8");
else if (readFileSync(noticePath, "utf8").replace(/\r\n/g, "\n") !== notice) {
  fail("DEPENDENCY-LICENSES.txt is stale; run node scripts/release-audit.mjs --write-notices");
}

console.log(`Release boundary and ${packages.length} dependency license records passed.`);
