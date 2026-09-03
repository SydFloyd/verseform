import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(1420, "127.0.0.1", () => resolveListen());
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const root = resolve("dist");
  const rootPrefix = `${root}${sep}`;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(
        request.url ?? "/",
        "http://127.0.0.1:1420",
      ).pathname;
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const path = resolve(root, relative);
      if (path !== resolve(root, "index.html") && !path.startsWith(rootPrefix)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        "content-type": contentTypes[extname(path)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await listen(server);
  return () => close(server);
}
