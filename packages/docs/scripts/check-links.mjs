import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteRoot = resolve(packageRoot, "dist");
const htmlFiles = await findFiles(siteRoot, (name) => name.endsWith(".html"));
const errors = [];

for (const file of htmlFiles) {
	const html = await readFile(file, "utf8");
	for (const href of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
		const value = href[1];
		if (!value || value.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
		if (value.includes(".md")) {
			errors.push(`${relative(siteRoot, file)} still links to Markdown: ${value}`);
			continue;
		}
		const target = value.split(/[?#]/, 1)[0];
		if (!target) continue;
		const resolved = target.startsWith("/")
			? resolve(siteRoot, `.${target}`)
			: resolve(dirname(file), target);
		if (!(await existsAsPageOrFile(resolved))) {
			errors.push(`${relative(siteRoot, file)} links to missing ${value}`);
		}
	}
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log(`Validated ${htmlFiles.length} rendered documentation pages.`);
}

async function findFiles(directory, matches) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(async (entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findFiles(entryPath, matches);
		return entry.isFile() && matches(entry.name) ? [entryPath] : [];
	}));
	return nested.flat();
}

async function existsAsPageOrFile(candidate) {
	for (const path of [candidate, `${candidate}.html`, resolve(candidate, "index.html")]) {
		try {
			await stat(path);
			return true;
		} catch {
			// Try the next static-site representation.
		}
	}
	return false;
}
