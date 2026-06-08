type CandidateDiffFile = {
  patch?: string;
  newPath?: string;
  oldPath?: string;
  filename?: string;
  path?: string;
};

export type InlineReviewComment = {
  path: string;
  line: number;
  body: string;
};

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function parseHunkHeader(line: string): { newStart: number } | null {
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  return match ? { newStart: Number(match[1]) } : null;
}

export function positionForLineInPatch(patch: string | undefined, line: number): number | undefined {
  if (!patch) return undefined;
  if (!Number.isInteger(line) || line < 1) return undefined;

  let position = 0;
  let currentNewLine = 0;
  let hasHunk = false;
  for (const rawLine of patch.split(/\r?\n/)) {
    if (rawLine.startsWith("@@")) {
      const hunk = parseHunkHeader(rawLine);
      if (!hunk) continue;
      hasHunk = true;
      currentNewLine = hunk.newStart - 1;
      continue;
    }

    if (!hasHunk) continue;
    if (rawLine.startsWith("\\")) continue;
    position += 1;

    if (rawLine.startsWith("+") || rawLine.startsWith(" ")) {
      currentNewLine += 1;
      if (currentNewLine === line) return position;
    } else if (rawLine.startsWith("-")) {
      // deletion only; does not advance new file line.
      continue;
    } else if (rawLine.length === 0 || rawLine.startsWith("diff") || rawLine.startsWith("index") || rawLine.startsWith("---") || rawLine.startsWith("+++")) {
      position -= 1;
    }
  }
  return undefined;
}

export function findDiffForPath(files: CandidateDiffFile[] | undefined, targetPath: string): CandidateDiffFile | undefined {
  if (!Array.isArray(files)) return undefined;
  const normalized = normalizePath(targetPath);
  const exact = files.find((file) => {
    const candidate = normalizePath(file.filename ?? file.path ?? file.newPath ?? "");
    return candidate === normalized;
  });
  if (exact) return exact;

  return files.find((file) => {
    const oldPath = normalizePath(file.oldPath ?? "");
    const newPath = normalizePath(file.newPath ?? "");
    return oldPath === normalized || newPath === normalized;
  });
}

export function validateReviewCommentPath(files: CandidateDiffFile[] | undefined, comment: InlineReviewComment): number {
  const file = findDiffForPath(files, comment.path);
  if (!file) {
    throw new Error(`Inline comment path is not part of the current diff: ${comment.path}`);
  }

  if (!Number.isInteger(comment.line) || comment.line < 1) {
    throw new Error(`Inline comment line must be a positive integer: ${comment.path}:${comment.line}`);
  }

  const patch = file.patch;
  const position = positionForLineInPatch(patch, comment.line);
  if (position === undefined) {
    throw new Error(`Inline comment line is not present in the current diff: ${comment.path}:${comment.line}`);
  }

  return position;
}
