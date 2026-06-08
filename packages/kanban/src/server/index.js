import { createServer } from "node:http";
import { existsSync, readFileSync, watch } from "node:fs";
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

function createBoardInvalidationHub() {
  const clients = new Set();
  return {
    add(response) {
      clients.add(response);
    },
    remove(response) {
      clients.delete(response);
    },
    broadcast(event, payload = {}) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const client of clients) {
        try {
          client.write(frame);
        } catch {
          clients.delete(client);
        }
      }
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
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

function cardActionId(pathname, suffix) {
  return decodeURIComponent(pathname.slice("/api/cards/".length, -suffix.length));
}

export async function startChangeyardKanban(options) {
  const board = createChangeyardBoardService(options.repoRoot);
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port === undefined || options.port === "auto" ? 0 : options.port;
  const invalidationHub = createBoardInvalidationHub();
  const watchedRoots = [
    path.join(options.repoRoot, ".changeyard", "changes"),
    path.join(options.repoRoot, ".changeyard", "reviews"),
    path.join(options.repoRoot, ".changeyard", "workspaces"),
  ];
  const watchers = [];
  let invalidateTimer = null;
  const scheduleInvalidation = () => {
    if (invalidateTimer) clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => {
      invalidationHub.broadcast("board-invalidated", { at: new Date().toISOString() });
    }, 120);
  };
  for (const root of watchedRoots) {
    if (!existsSync(root)) continue;
    try {
      watchers.push(watch(root, { recursive: true }, () => scheduleInvalidation()));
    } catch {
      // Best effort; startup should not fail if recursive watch is unavailable.
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${host}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
        invalidationHub.add(response);
        request.on("close", () => invalidationHub.remove(response));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/board") {
        sendJson(response, 200, board.getBoard());
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/cards/")) {
        if (url.pathname.endsWith("/workspace-view")) {
          const id = cardActionId(url.pathname, "/workspace-view");
          sendJson(response, 200, board.getWorkspaceView(id));
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length));
        sendJson(response, 200, board.getCard(id));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/cards") {
        const body = await readJsonBody(request);
        sendJson(response, 200, board.createCard({
          template: typeof body.template === "string" ? body.template : "agent-task",
          title: typeof body.title === "string" ? body.title : "",
          priority: typeof body.priority === "string" ? body.priority : undefined,
          author: typeof body.author === "string" ? body.author : undefined,
          labels: Array.isArray(body.labels) ? body.labels.map((entry) => String(entry)) : undefined,
          planFile: typeof body.planFile === "string" ? body.planFile : undefined,
        }));
        return;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/cards/") && url.pathname.includes("/sections/")) {
        const marker = "/sections/";
        const markerIndex = url.pathname.indexOf(marker);
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length, markerIndex));
        const sectionName = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
        const body = await readJsonBody(request);
        sendJson(response, 200, board.updateCardSection(
          id,
          sectionName,
          typeof body.content === "string" ? body.content : "",
        ));
        return;
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/api/cards/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/cards/".length));
        const body = await readJsonBody(request);
        sendJson(response, 200, board.updateCard(id, {
          title: typeof body.title === "string" ? body.title : undefined,
          priority: body.priority === null ? null : typeof body.priority === "string" ? body.priority : undefined,
          labels: Array.isArray(body.labels) ? body.labels.map((entry) => String(entry)) : undefined,
        }));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/review/start")) {
        const id = cardActionId(url.pathname, "/review/start");
        sendJson(response, 200, board.startReview(id));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/review/complete")) {
        const id = cardActionId(url.pathname, "/review/complete");
        const body = await readJsonBody(request);
        const decision = typeof body.decision === "string" ? body.decision : "";
        sendJson(response, 200, board.completeReview(id, decision));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/sync")) {
        const id = cardActionId(url.pathname, "/sync");
        sendJson(response, 200, board.syncCard(id));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/start")) {
        const id = cardActionId(url.pathname, "/start");
        sendJson(response, 200, board.startCard(id));
        return;
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/cards/") && url.pathname.endsWith("/complete")) {
        const id = cardActionId(url.pathname, "/complete");
        const body = await readJsonBody(request);
        const withPr = body.withPr === true;
        sendJson(response, 200, board.completeCard(id, { noPr: !withPr }));
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
      if (invalidateTimer) clearTimeout(invalidateTimer);
      for (const watcher of watchers) watcher.close();
      server.close((error) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    }),
  };
}
