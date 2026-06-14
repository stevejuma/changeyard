import { build } from "bun";

const result = await build({
  entrypoints: ["src/index.tsx"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  external: [
    "@opentui/core",
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

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
