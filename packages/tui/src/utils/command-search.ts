// Adapted from Cline CLI command palette scoring (Apache-2.0).
// See packages/tui/src/vendor/ATTRIBUTION.cline-cli.md.
export type SearchableCommandItem = {
  title: string;
  description?: string;
  category?: string;
  footer?: unknown;
  keywords?: readonly string[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[+-]/g, " ")
    .replace(/[^a-z0-9/ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function footerText(footer: unknown): string {
  return typeof footer === "string" ? footer : "";
}

export function scoreCommandItem(item: SearchableCommandItem, query: string): number {
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return 1;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const title = normalize(item.title);
  const description = normalize(item.description ?? "");
  const category = normalize(item.category ?? "");
  const keywordText = normalize((item.keywords ?? []).join(" "));
  const footer = normalize(footerText(item.footer));
  const searchText = `${title} ${description} ${category} ${keywordText} ${footer}`;

  if (!includesAllTokens(searchText, tokens)) return 0;
  if (title === normalizedQuery) return 120;
  if (title.startsWith(normalizedQuery)) return 100;
  if (title.includes(normalizedQuery)) return 75;
  if (footer.includes(normalizedQuery)) return 70;
  if (keywordText.includes(normalizedQuery)) return 60;
  if (category.includes(normalizedQuery)) return 50;
  if (description.includes(normalizedQuery)) return 45;
  return 20;
}

export function filterCommandItems<T extends SearchableCommandItem>(items: readonly T[], query: string): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreCommandItem(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
