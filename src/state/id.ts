import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "change";
}

export function allocateId(changesRoot: string, prefix: string): string {
  let max = 0;
  if (existsSync(changesRoot)) {
    for (const file of readdirSync(changesRoot)) {
      const match = new RegExp(`^${prefix}-(\\d{4,})`).exec(file);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function findChangeFile(changesRoot: string, id: string): string | undefined {
  if (!existsSync(changesRoot)) return undefined;
  const exact = path.join(changesRoot, `${id}.md`);
  if (existsSync(exact)) return exact;
  return readdirSync(changesRoot)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(changesRoot, file))
    .find((filePath) => path.basename(filePath).startsWith(`${id}-`));
}
