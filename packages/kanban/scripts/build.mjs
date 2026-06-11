import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const srcIndex = path.join(root, "src", "index.js");
const srcServerDir = path.join(root, "src", "server");
const webUiDist = path.join(root, "web-ui", "dist");
const vcsUiDist = path.join(root, "..", "..", "vcs", "dist");

mkdirSync(dist, { recursive: true });
rmSync(path.join(dist, "index.js"), { force: true });
rmSync(path.join(dist, "server"), { recursive: true, force: true });
rmSync(path.join(dist, "web-ui"), { recursive: true, force: true });
rmSync(path.join(dist, "vcs-ui"), { recursive: true, force: true });

cpSync(srcIndex, path.join(dist, "index.js"));
cpSync(srcServerDir, path.join(dist, "server"), { recursive: true });
if (existsSync(webUiDist)) {
  cpSync(webUiDist, path.join(dist, "web-ui"), { recursive: true });
}
if (existsSync(vcsUiDist)) {
  cpSync(vcsUiDist, path.join(dist, "vcs-ui"), { recursive: true });
}
