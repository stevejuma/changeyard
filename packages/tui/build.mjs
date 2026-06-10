import solidPlugin from "@opentui/solid/bun-plugin";
import { build } from "bun";

await build({
  entrypoints: ["src/index.tsx"],
  outdir: "dist",
  target: "bun",
  plugins: [solidPlugin],
  external: [
    "@opentui/core-darwin-x64",
    "@opentui/core-darwin-arm64",
    "@opentui/core-linux-x64",
    "@opentui/core-linux-arm64",
    "@opentui/core-linux-x64-musl",
    "@opentui/core-linux-arm64-musl",
    "@opentui/core-win32-x64",
    "@opentui/core-win32-arm64",
  ],
});
