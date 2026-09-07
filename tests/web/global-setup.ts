import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import config from "../../vercel.json" with { type: "json" };

export default async function setup() {
  const root = resolve("dist-web");
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1:1440").pathname;
      const path = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
      if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const body = await readFile(path);
      response.writeHead(200, { ...headers, "content-type": types[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
      response.end(body);
    } catch { response.writeHead(404).end("Not found"); }
  });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(1440, "127.0.0.1", done); });
  return () => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
}
