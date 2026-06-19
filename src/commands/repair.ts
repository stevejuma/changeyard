import { repairWorkspace } from "./recover.js";

export type RepairOptions = {
  dryRun?: boolean;
  workspace?: boolean;
};

export function runRepair(id: string, options: RepairOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  if (!options.workspace) {
    throw new Error([
      "cy repair currently requires --workspace",
      "",
      "Recovery:",
      `- Run cy repair ${id} --workspace to repair recoverable workspace state.`,
    ].join("\n"));
  }
  return repairWorkspace(id, repoRoot, options);
}

