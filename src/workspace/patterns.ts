import path from "node:path";

export function pathInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function matchesPattern(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const normalizedPattern = pattern.split(path.sep).join("/");
  if (normalized === normalizedPattern || normalized.endsWith(`/${normalizedPattern}`)) return true;
  if (!normalizedPattern.includes("*")) return normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`);
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`(^|/)${escaped}($|/)`).test(normalized);
}

export function isDenied(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(relativePath, pattern));
}
