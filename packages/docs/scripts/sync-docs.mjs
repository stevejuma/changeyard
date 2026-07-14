import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path, { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(packageRoot, "..", "..");
const sourceRoot = resolve(repoRoot, "docs");
const outputRoot = resolve(packageRoot, "src", "content", "docs");

// Keep established public routes stable while every other canonical source page
// is published at the matching docs path.
const legacyRoutes = new Map([
	["index.md", "index.md"],
	["getting-started.md", "getting-started/index.md"],
	["hub.md", "cli-hub/hub.md"],
	["cli/root.md", "cli-hub/cli-reference.md"],
	["cli/hub.md", "reference/cli-hub-command.md"],
	["architecture.md", "architecture/index.md"],
	["desktop.md", "architecture/desktop.md"],
	["adr-inline-planning.md", "architecture/inline-planning.md"],
	["troubleshooting.md", "troubleshooting/index.md"],
	["planning-profiles.md", "reference/planning-profiles.md"],
	["versioning-policy.md", "reference/versioning-policy.md"],
	["release-notes.md", "reference/release-notes.md"],
]);

const sourceFiles = [...await findMarkdownFiles(sourceRoot), "../CHANGELOG.md"];
const routes = new Map(sourceFiles.map((source) => [source, source === "../CHANGELOG.md" ? "reference/changelog.md" : legacyRoutes.get(source) ?? source]));

await rm(outputRoot, { recursive: true, force: true });

for (const source of sourceFiles) {
	const output = routes.get(source);
	if (!output) throw new Error(`Missing docs route for ${source}`);
	const sourcePath = source === "../CHANGELOG.md" ? resolve(repoRoot, "CHANGELOG.md") : resolve(sourceRoot, source);
	const outputPath = resolve(outputRoot, output);
	const markdown = await readFile(sourcePath, "utf8");
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, renderPage({ source, output, markdown, routes }));
}

console.log(`Synced ${sourceFiles.length} docs pages to ${outputRoot}`);

async function findMarkdownFiles(root, directory = root) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(async (entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findMarkdownFiles(root, entryPath);
		if (entry.isFile() && entry.name.endsWith(".md")) return [relative(root, entryPath)];
		return [];
	}));
	return nested.flat().sort();
}

function renderPage({ source, output, markdown, routes }) {
	const withoutFrontmatter = stripFrontmatter(markdown);
	const title = firstHeading(withoutFrontmatter) ?? titleFromPath(source);
	const body = rewriteMarkdownLinks(stripFirstHeading(withoutFrontmatter).trimStart(), source, output, routes);
	return `---\ntitle: ${quoteYaml(title)}\n---\n\n${body}`;
}

function rewriteMarkdownLinks(markdown, source, output, routes) {
	return markdown.replace(/(\]\()([^\s)]+)(\))/g, (match, prefix, href, suffix) => {
		if (href.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return match;
		const [target, fragment = ""] = href.split("#", 2);
		if (!target.endsWith(".md")) return match;
		const resolvedSource = path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
		const targetOutput = routes.get(resolvedSource);
		if (!targetOutput) return match;
		return `${prefix}${routeUrl(targetOutput)}${fragment ? `#${fragment}` : ""}${suffix}`;
	});
}

function routeUrl(output) {
	const withoutExtension = output.replace(/\.md$/, "");
	const normalized = withoutExtension === "index" ? "" : withoutExtension.replace(/\/index$/, "");
	return `/${normalized}${normalized ? "/" : ""}`;
}

function stripFrontmatter(markdown) {
	if (!markdown.startsWith("---\n")) return markdown;
	const end = markdown.indexOf("\n---\n", 4);
	return end === -1 ? markdown : markdown.slice(end + 5);
}

function firstHeading(markdown) {
	return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function stripFirstHeading(markdown) {
	return markdown.replace(/^# [^\n]+\n+/, "");
}

function titleFromPath(source) {
	return source
		.replace(/\.md$/, "")
		.split("/")
		.map((part) => part.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
		.join(" / ");
}

function quoteYaml(value) {
	return JSON.stringify(value);
}
