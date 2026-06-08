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
