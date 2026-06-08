export function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let current: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const heading = /^#\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.set(current, buffer.join("\n").trim());
      current = heading[1];
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections.set(current, buffer.join("\n").trim());

  return sections;
}

export function hasCheckboxTask(section: string): boolean {
  return /^\s*- \[[ xX]\]\s+\S/m.test(section);
}

export function hasUncheckedCheckboxTask(section: string): boolean {
  return /^\s*- \[ \]\s+\S/m.test(section);
}

export function replaceSection(markdown: string, sectionName: string, content: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^#\s+(.+?)\s*$/.exec(lines[index]);
    if (!heading) continue;
    if (start === -1) {
      if (heading[1] === sectionName) start = index;
      continue;
    }
    end = index;
    break;
  }

  if (start === -1) throw new Error(`Section not found: ${sectionName}`);

  const normalizedContent = content.trim().replace(/\r\n/g, "\n");
  const nextLines = [
    ...lines.slice(0, start + 1),
    "",
    ...(normalizedContent ? normalizedContent.split("\n") : []),
    "",
    ...lines.slice(end),
  ];

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n");
}
