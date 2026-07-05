import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.PREVIEW_PORT || process.argv[2] || 5199);
const host = process.env.PREVIEW_HOST || "::1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://localhost:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/3d-particle-display-os/previews/cognitive-sector-layout-v2.html" : requestUrl.pathname);
    const filePath = resolve(root, `.${pathname}`);

    if (!isInside(filePath, root)) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Not found");
  }
}).listen(port, host, () => {
  console.log(`Preview server running at http://[${host}]:${port}/3d-particle-display-os/previews/cognitive-sector-layout-v2.html`);
});

function isInside(filePath, rootPath) {
  return filePath === rootPath || filePath.startsWith(`${rootPath}${sep}`);
}
