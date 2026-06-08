import type { Frontmatter, FrontmatterValue, ParsedMarkdown } from "../types.js";

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function setNested(target: Frontmatter, keys: string[], value: FrontmatterValue): void {
  let current: Record<string, FrontmatterValue> = target;
  for (const key of keys.slice(0, -1)) {
    const existing = current[key];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      current[key] = {};
    }
    current = current[key] as Record<string, FrontmatterValue>;
  }
  current[keys[keys.length - 1]] = value;
}

function getNested(target: Frontmatter, keys: string[]): FrontmatterValue | undefined {
  let current: FrontmatterValue = target;
  for (const key of keys) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function parseFrontmatter(input: string): ParsedMarkdown {
  if (!input.startsWith("---\n")) return { frontmatter: {}, body: input };
  const end = input.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: input };

  const raw = input.slice(4, end).replace(/\r\n/g, "\n");
  const bodyStart = input.indexOf("\n", end + 4);
  const body = bodyStart === -1 ? "" : input.slice(bodyStart + 1);
  const frontmatter: Frontmatter = {};
  const stack: { indent: number; path: string[] }[] = [{ indent: -1, path: [] }];
  let lastPath: string[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parentPath = stack[stack.length - 1].path;

    if (trimmed.startsWith("- ")) {
      const existing = getNested(frontmatter, lastPath);
      const array = Array.isArray(existing) ? existing : [];
      array.push(parseScalar(trimmed.slice(2)));
      setNested(frontmatter, lastPath, array);
      continue;
    }

    const match = /^([^:]+):(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2];
    const path = [...parentPath, key];
    lastPath = path;

    if (value.trim() === "") {
      setNested(frontmatter, path, {});
      stack.push({ indent, path });
    } else {
      setNested(frontmatter, path, parseScalar(value));
    }
  }

  return { frontmatter, body };
}

function stringifyValue(value: FrontmatterValue, indent = 0): string[] {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) return value.map((item) => `${pad}- ${String(item ?? "")}`);
  if (typeof value === "object" && value !== null) {
    const lines: string[] = [];
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "object" && nested !== null) {
        lines.push(`${pad}${key}:`);
        lines.push(...stringifyValue(nested, indent + 2));
      } else {
        lines.push(`${pad}${key}: ${nested === null ? "null" : String(nested)}`);
      }
    }
    return lines;
  }
  return [`${pad}${value === null ? "null" : String(value)}`];
}

export function writeFrontmatter(frontmatter: Frontmatter, body: string): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`);
      lines.push(...stringifyValue(value, 2));
    } else {
      lines.push(`${key}: ${value === null ? "null" : String(value)}`);
    }
  }
  lines.push("---", "", body.trimStart());
  return lines.join("\n");
}
