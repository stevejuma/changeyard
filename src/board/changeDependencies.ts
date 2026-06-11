import type { Frontmatter } from "../types.js";

export type ChangeLinks = {
  blockedBy: string[];
};

export type ChangeDependencyInfo = ChangeLinks & {
  blocks: string[];
};

export function asFrontmatterRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

export function normalizeBlockedByIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    const id = String(entry).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function parseChangeLinks(frontmatter: Frontmatter): ChangeLinks {
  const links = asFrontmatterRecord(frontmatter.links);
  return {
    blockedBy: normalizeBlockedByIds(links.blockedBy),
  };
}

export function deriveChangeDependencyInfo(changes: Array<{ id: string; frontmatter: Frontmatter }>): Map<string, ChangeDependencyInfo> {
  const blockedByMap = new Map<string, string[]>();
  const blocksMap = new Map<string, string[]>();

  for (const change of changes) {
    blockedByMap.set(change.id, parseChangeLinks(change.frontmatter).blockedBy);
    blocksMap.set(change.id, []);
  }

  for (const [changeId, blockedBy] of blockedByMap.entries()) {
    for (const blockedById of blockedBy) {
      const reverse = blocksMap.get(blockedById);
      if (!reverse) continue;
      reverse.push(changeId);
    }
  }

  const result = new Map<string, ChangeDependencyInfo>();
  for (const change of changes) {
    result.set(change.id, {
      blockedBy: blockedByMap.get(change.id) ?? [],
      blocks: blocksMap.get(change.id) ?? [],
    });
  }
  return result;
}

export function assertNoDependencyCycle(
  dependencies: Map<string, string[]>,
  changeId: string,
  blockedByChangeId: string,
): void {
  const pending = [...(dependencies.get(blockedByChangeId) ?? [])];
  const seen = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    if (current === changeId) {
      throw new Error(`Linking ${changeId} to ${blockedByChangeId} would create a dependency cycle.`);
    }
    seen.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
}
