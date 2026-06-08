import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProviderState = {
  nextIssueNumber: number;
  issues: Record<string, number>;
};

export function readProviderState(storageRoot: string): ProviderState {
  const statePath = path.join(storageRoot, "cache", "provider-state.json");
  if (!existsSync(statePath)) return { nextIssueNumber: 1, issues: {} };
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<ProviderState>;
  return {
    nextIssueNumber: typeof parsed.nextIssueNumber === "number" ? parsed.nextIssueNumber : 1,
    issues: parsed.issues && typeof parsed.issues === "object" ? parsed.issues : {},
  };
}

export function writeProviderState(storageRoot: string, state: ProviderState): void {
  const statePath = path.join(storageRoot, "cache", "provider-state.json");
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function issueNumberFor(storageRoot: string, changeId: string): number {
  const state = readProviderState(storageRoot);
  const existing = state.issues[changeId];
  if (existing) return existing;

  const next = state.nextIssueNumber;
  state.issues[changeId] = next;
  state.nextIssueNumber = next + 1;
  writeProviderState(storageRoot, state);
  return next;
}
