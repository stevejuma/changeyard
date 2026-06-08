import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectApiUrl = new URL("../../../../dist/src/index.js", import.meta.url);
const { createChangeyardBoardService } = await import(projectApiUrl.href);

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Best effort only.
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function webUiDir() {
  const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web-ui");
  if (!existsSync(path.join(candidate, "index.html"))) {
    throw new Error("Changeyard UI assets were not found. Run npm run build before launching cy ui.");
  }
  return candidate;
}

function staticFile(targetPath) {
  const root = webUiDir();
  const requested = targetPath === "/" ? "/index.html" : targetPath;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized);
  if (!filePath.startsWith(root) || !existsSync(filePath)) return null;
  return filePath;
}

export async function startChangeyardKanban(options) {
  const board = createChangeyardBoardService(options.repoRoot);
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port === undefined || options.port === "auto" ? 0 : options.port;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${host}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/board") {
        sendJson(response, 200, board.getBoard());
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/cards/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length));
        sendJson(response, 200, board.getCard(id));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/sync")) {
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length, -"/sync".length));
        sendJson(response, 200, board.syncCard(id));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/start")) {
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length, -"/start".length));
        sendJson(response, 200, board.startCard(id));
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { ok: false, error: { message: "Method not allowed" } });
        return;
      }

      const filePath = staticFile(url.pathname);
      if (!filePath) {
        sendText(response, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }

      const extension = path.extname(filePath);
      const contentType = extension === ".css"
        ? "text/css; charset=utf-8"
        : extension === ".js"
          ? "application/javascript; charset=utf-8"
          : "text/html; charset=utf-8";
      sendText(response, 200, readFileSync(filePath, "utf8"), contentType);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve(undefined));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${port}`;
  if (options.open) openBrowser(url);

  return {
    url,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    }),
  };
}
