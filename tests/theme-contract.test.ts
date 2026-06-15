import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT_DIR = process.cwd();
const KANBAN_CSS_PATH = join(ROOT_DIR, "packages/kanban/web-ui/src/styles/globals.css");
const VCS_CSS_PATH = join(ROOT_DIR, "packages/vcs/src/styles/globals.css");
const LIGHT_THEME_IDS = ["light", "overcast", "solarized-light", "latte", "high-contrast-light"] as const;
const COLOR_TOKEN_DEFINITION_RE = /(--color-[a-z0-9-]+)\s*:/g;
const COLOR_VAR_REF_RE = /var\((--color-[a-z0-9-]+)/g;
const THEME_BLOCK_RE = /\[data-theme="([^"]+)"\]\s*{([\s\S]*?)}/g;
const HEX_VAR_RE = /(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;
const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const STATUS_TOKEN_NAMES = [
	"--color-status-blue",
	"--color-status-green",
	"--color-status-orange",
	"--color-status-red",
	"--color-status-purple",
	"--color-status-gold",
	"--color-status-violet",
	"--color-status-rose",
	"--color-status-cyan",
	"--color-status-lime",
] as const;

interface ThemeCss {
	base: Record<string, string>;
	themeBlocks: Map<string, Record<string, string>>;
	definedColorTokens: Set<string>;
}

function parseThemeCss(path: string): ThemeCss {
	const css = readFileSync(path, "utf8");
	const baseMatch = css.match(/@theme\s*{([\s\S]*?)}/);
	assert.ok(baseMatch, `${path} must define an @theme block`);
	const base = parseHexVars(baseMatch[1]);
	const themeBlocks = new Map<string, Record<string, string>>();
	for (const match of css.matchAll(THEME_BLOCK_RE)) {
		themeBlocks.set(match[1], parseHexVars(match[2]));
	}
	const definedColorTokens = new Set([...css.matchAll(COLOR_TOKEN_DEFINITION_RE)].map((match) => match[1]));
	return { base, themeBlocks, definedColorTokens };
}

function parseHexVars(source: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const match of source.matchAll(HEX_VAR_RE)) {
		vars[match[1]] = normalizeHex(match[2]);
	}
	return vars;
}

function resolveTheme(css: ThemeCss, themeId: string): Record<string, string> {
	const overrides = css.themeBlocks.get(themeId);
	assert.ok(overrides, `Theme ${themeId} is missing`);
	return { ...css.base, ...overrides };
}

function sortedKeys(value: Record<string, string>): string[] {
	return Object.keys(value).sort();
}

function normalizeHex(value: string): string {
	const hex = value.toUpperCase();
	if (/^#[0-9A-F]{3}$/.test(hex)) {
		return `#${hex
			.slice(1)
			.split("")
			.map((part) => `${part}${part}`)
			.join("")}`;
	}
	return hex.slice(0, 7);
}

function hexToRgb(hex: string): readonly [number, number, number] {
	const normalized = normalizeHex(hex);
	return [
		Number.parseInt(normalized.slice(1, 3), 16),
		Number.parseInt(normalized.slice(3, 5), 16),
		Number.parseInt(normalized.slice(5, 7), 16),
	] as const;
}

function relativeLuminance(hex: string): number {
	const [red, green, blue] = hexToRgb(hex).map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(a: string, b: string): number {
	const first = relativeLuminance(a);
	const second = relativeLuminance(b);
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

function assertContrast({
	themeId,
	foregroundName,
	backgroundName,
	foreground,
	background,
	minimum,
}: {
	themeId: string;
	foregroundName: string;
	backgroundName: string;
	foreground: string;
	background: string;
	minimum: number;
}): void {
	const ratio = contrastRatio(foreground, background);
	assert.ok(
		ratio >= minimum,
		`${themeId} ${foregroundName} on ${backgroundName} contrast ${ratio.toFixed(2)} is below ${minimum}`,
	);
}

function* walkSourceFiles(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			yield* walkSourceFiles(path);
			continue;
		}
		const extension = path.slice(path.lastIndexOf("."));
		if (SOURCE_EXTENSIONS.has(extension)) {
			yield path;
		}
	}
}

test("Kanban and VCS theme CSS expose matching color token keys", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	const vcs = parseThemeCss(VCS_CSS_PATH);
	assert.deepEqual(sortedKeys(kanban.base), sortedKeys(vcs.base), "base @theme color tokens drifted");
	assert.deepEqual(
		[...kanban.themeBlocks.keys()].sort(),
		[...vcs.themeBlocks.keys()].sort(),
		"theme id lists drifted",
	);
	for (const themeId of kanban.themeBlocks.keys()) {
		assert.deepEqual(
			sortedKeys(kanban.themeBlocks.get(themeId) ?? {}),
			sortedKeys(vcs.themeBlocks.get(themeId) ?? {}),
			`${themeId} color override tokens drifted`,
		);
	}
	for (const themeId of LIGHT_THEME_IDS) {
		const tokens = kanban.themeBlocks.get(themeId) ?? {};
		for (const token of STATUS_TOKEN_NAMES) {
			assert.ok(token in tokens, `${themeId} must override ${token} for light-theme contrast`);
		}
	}
});

test("app source does not reference undefined --color-* CSS variables", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	const vcs = parseThemeCss(VCS_CSS_PATH);
	const definedTokens = new Set([...kanban.definedColorTokens, ...vcs.definedColorTokens]);
	const sourceRoots = [join(ROOT_DIR, "packages/kanban/web-ui/src"), join(ROOT_DIR, "packages/vcs/src")];
	const missing: string[] = [];
	for (const sourceRoot of sourceRoots) {
		for (const filePath of walkSourceFiles(sourceRoot)) {
			const source = readFileSync(filePath, "utf8");
			for (const match of source.matchAll(COLOR_VAR_REF_RE)) {
				if (!definedTokens.has(match[1])) {
					missing.push(`${relative(ROOT_DIR, filePath)} references ${match[1]}`);
				}
			}
		}
	}
	assert.deepEqual(missing, []);
});

test("light theme readable color tokens meet contrast requirements", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	for (const themeId of LIGHT_THEME_IDS) {
		const theme = resolveTheme(kanban, themeId);
		for (const textToken of ["--color-text-primary", "--color-text-secondary", "--color-text-tertiary"]) {
			for (const surfaceToken of [
				"--color-surface-0",
				"--color-surface-1",
				"--color-surface-2",
				"--color-surface-3",
			]) {
				assertContrast({
					themeId,
					foregroundName: textToken,
					backgroundName: surfaceToken,
					foreground: theme[textToken],
					background: theme[surfaceToken],
					minimum: 4.5,
				});
			}
		}
		for (const statusToken of STATUS_TOKEN_NAMES) {
			for (const surfaceToken of [
				"--color-surface-0",
				"--color-surface-1",
				"--color-surface-2",
				"--color-surface-3",
			]) {
				assertContrast({
					themeId,
					foregroundName: statusToken,
					backgroundName: surfaceToken,
					foreground: theme[statusToken],
					background: theme[surfaceToken],
					minimum: 4.5,
				});
			}
		}
		assertContrast({
			themeId,
			foregroundName: "--color-accent-fg",
			backgroundName: "--color-accent",
			foreground: theme["--color-accent-fg"],
			background: theme["--color-accent"],
			minimum: 4.5,
		});
		assertContrast({
			themeId,
			foregroundName: "--color-accent-2-fg",
			backgroundName: "--color-accent-2",
			foreground: theme["--color-accent-2-fg"],
			background: theme["--color-accent-2"],
			minimum: 4.5,
		});
	}
});

test("light theme surfaces and borders have visible separation", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	for (const themeId of LIGHT_THEME_IDS) {
		const theme = resolveTheme(kanban, themeId);
		assertContrast({
			themeId,
			foregroundName: "--color-surface-1",
			backgroundName: "--color-surface-2",
			foreground: theme["--color-surface-1"],
			background: theme["--color-surface-2"],
			minimum: 1.04,
		});
		assertContrast({
			themeId,
			foregroundName: "--color-surface-2",
			backgroundName: "--color-surface-3",
			foreground: theme["--color-surface-2"],
			background: theme["--color-surface-3"],
			minimum: 1.05,
		});
		assertContrast({
			themeId,
			foregroundName: "--color-border",
			backgroundName: "--color-surface-1",
			foreground: theme["--color-border"],
			background: theme["--color-surface-1"],
			minimum: 1.3,
		});
		assertContrast({
			themeId,
			foregroundName: "--color-border-bright",
			backgroundName: "--color-surface-1",
			foreground: theme["--color-border-bright"],
			background: theme["--color-surface-1"],
			minimum: 1.7,
		});
	}
});
