export const DEFAULT_WRAP_WIDTH = 88;
export const MIN_WRAP_WIDTH = 48;

export function terminalWrapWidth(): number {
  const columns = Number(process.stdout?.columns ?? process.env.COLUMNS ?? 0);
  if (!Number.isFinite(columns) || columns <= 0) return DEFAULT_WRAP_WIDTH;
  return Math.max(MIN_WRAP_WIDTH, columns);
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function wrapText(value: string, width: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (stripAnsi(candidate).length <= width || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export function pushWrapped(
  lines: string[],
  prefix: string,
  value: string,
  width: number,
  continuationPrefix = " ".repeat(stripAnsi(prefix).length),
): void {
  const wrapped = wrapText(value, Math.max(20, width - stripAnsi(prefix).length));
  lines.push(`${prefix}${wrapped[0] ?? ""}`);
  for (const line of wrapped.slice(1)) lines.push(`${continuationPrefix}${line}`);
}

function wrapRenderedLine(line: string, width: number): string[] {
  if (stripAnsi(line).length <= width) return [line];
  const bulletMatch = /^(\s*[-*]\s+)(.+)$/.exec(line);
  if (bulletMatch) {
    const lines: string[] = [];
    pushWrapped(lines, bulletMatch[1], bulletMatch[2], width);
    return lines;
  }
  const fieldMatch = /^(\s*[^:\s][^:]{0,28}:\s+)(.+)$/.exec(line);
  if (fieldMatch) {
    const lines: string[] = [];
    pushWrapped(lines, fieldMatch[1], fieldMatch[2], width);
    return lines;
  }
  const indent = /^\s*/.exec(line)?.[0] ?? "";
  const lines: string[] = [];
  pushWrapped(lines, indent, line.slice(indent.length), width);
  return lines;
}

export function wrapRenderedText(value: string, width = terminalWrapWidth()): string {
  const lines: string[] = [];
  let inFence = false;
  for (const line of value.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      lines.push(line);
      continue;
    }
    if (inFence || line.trim() === "") {
      lines.push(line);
      continue;
    }
    lines.push(...wrapRenderedLine(line, width));
  }
  return lines.join("\n");
}
