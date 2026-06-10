import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useSource = process.env.CHANGEYARD_DEV === "1" || process.env.CHANGEYARD_USE_DIST === "0";

const routerCandidates = useSource
  ? ["packages/kanban/src/runtime-stack/trpc/app-router.ts"]
  : [
      "packages/kanban/dist/runtime-stack/trpc/app-router.js",
      "packages/kanban/src/runtime-stack/trpc/app-router.ts",
    ];

const uiCandidates = useSource
  ? ["src/commands/ui.ts"]
  : ["dist/src/commands/ui.js", "src/commands/ui.ts"];

const trpcProcedures = [
  "init:",
  "getProjectConfig:",
  "updateProjectConfig:",
  "doctor:",
];

const uiMethods = [
  "initProject(",
  "getProjectConfig(",
  "updateProjectConfig(",
  "doctorProject(",
];

function assertContains(filePaths, needles, label) {
  const existing = filePaths.map((filePath) => path.join(root, filePath)).filter((filePath) => existsSync(filePath));
  if (existing.length === 0) {
    console.error(`Missing ${label}. Checked: ${filePaths.join(", ")}`);
    console.error(useSource ? "Source dev mode expects TypeScript sources in the repo." : "Run: npm run build");
    process.exit(1);
  }
  for (const filePath of existing) {
    const content = readFileSync(filePath, "utf8");
    const missing = needles.filter((needle) => !content.includes(needle));
    if (missing.length === 0) {
      console.log(`ok - TUI backing endpoints present in ${path.relative(root, filePath)}`);
      return;
    }
  }
  console.error(`${label} is stale or incomplete. Checked: ${existing.map((p) => path.relative(root, p)).join(", ")}`);
  console.error(`Missing: ${needles.join(", ")}`);
  console.error(useSource ? "Update source files in the repo." : "Run: npm run build");
  process.exit(1);
}

assertContains(routerCandidates, trpcProcedures, "Kanban tRPC router");
assertContains(uiCandidates, uiMethods, "Changeyard UI API");
