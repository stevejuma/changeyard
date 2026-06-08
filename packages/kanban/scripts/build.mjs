import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const src = path.join(root, "src");
const webUiDist = path.join(root, "web-ui", "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(src, dist, { recursive: true });
if (existsSync(webUiDist)) {
  cpSync(webUiDist, path.join(dist, "web-ui"), { recursive: true });
}
