import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT_DIR = process.cwd();
const KANBAN_CSS_PATH = join(ROOT_DIR, "packages/kanban/web-ui/src/styles/globals.css");
const KANBAN_THEME_TS_PATH = join(ROOT_DIR, "packages/kanban/web-ui/src/hooks/use-theme.ts");
const VCS_CSS_PATH = join(ROOT_DIR, "packages/vcs/src/styles/globals.css");
const VCS_THEME_TS_PATH = join(ROOT_DIR, "packages/vcs/src/utils/vcs-theme.ts");
const LIGHT_THEME_IDS = ["light", "overcast", "solarized-light", "latte", "high-contrast-light"] as const;
const DEFAULT_THEME_ID = "default";
const COLOR_TOKEN_DEFINITION_RE = /(--color-[a-z0-9-]+)\s*:/g;
const COLOR_VAR_REF_RE = /var\((--color-[a-z0-9-]+)/g;
const THEME_BLOCK_RE = /\[data-theme="([^"]+)"\]\s*{([\s\S]*?)}/g;
const ROOT_BLOCK_RE = /:root\s*{([\s\S]*?)}/;
const VAR_RE = /(--(?:color|kb)-[a-z0-9-]+):\s*([^;]+)\s*;/g;
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const VAR_REF_RE = /^var\((--(?:color|kb)-[a-z0-9-]+)\)$/;
const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const SELECTED_TOKEN_NAMES = [
	"--kb-selected-bg",
	"--kb-selected-fg",
	"--kb-selected-muted-fg",
	"--kb-selected-border",
] as const;
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
const TERMINAL_THEME_PROP_RE =
	/(textPrimary|surfacePrimary|surfaceRaised|selectionBackground|selectionForeground|selectionInactiveBackground):\s*"(#[0-9a-fA-F]{6,8})"/g;
const TERMINAL_THEME_BLOCK_RE = /\n\t(?:"([^"]+)"|([a-z][a-z0-9-]*)):\s*{([\s\S]*?)\n\t},/g;

interface ThemeCss {
	base: Record<string, string>;
	root: Record<string, string>;
	themeBlocks: Map<string, Record<string, string>>;
	definedColorTokens: Set<string>;
}

interface TerminalThemeColors {
	textPrimary: string;
	surfacePrimary: string;
	surfaceRaised: string;
	selectionBackground: string;
	selectionForeground: string;
	selectionInactiveBackground: string;
}

function parseThemeCss(path: string): ThemeCss {
	const css = readFileSync(path, "utf8");
	const baseMatch = css.match(/@theme\s*{([\s\S]*?)}/);
	assert.ok(baseMatch, `${path} must define an @theme block`);
	const base = parseVars(baseMatch[1]);
	const root = parseVars(css.match(ROOT_BLOCK_RE)?.[1] ?? "");
	const themeBlocks = new Map<string, Record<string, string>>();
	for (const match of css.matchAll(THEME_BLOCK_RE)) {
		themeBlocks.set(match[1], parseVars(match[2]));
	}
	const definedColorTokens = new Set([...css.matchAll(COLOR_TOKEN_DEFINITION_RE)].map((match) => match[1]));
	return { base, root, themeBlocks, definedColorTokens };
}

function parseVars(source: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const match of source.matchAll(VAR_RE)) {
		vars[match[1]] = normalizeVarValue(match[2]);
	}
	return vars;
}

function resolveTheme(css: ThemeCss, themeId: string): Record<string, string> {
	if (themeId === DEFAULT_THEME_ID) {
		return { ...css.base, ...css.root };
	}
	const overrides = css.themeBlocks.get(themeId);
	assert.ok(overrides, `Theme ${themeId} is missing`);
	return { ...css.base, ...css.root, ...overrides };
}

function themeIds(css: ThemeCss): string[] {
	return [DEFAULT_THEME_ID, ...css.themeBlocks.keys()];
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

function normalizeHexWithAlpha(value: string): string {
	const hex = value.toUpperCase();
	if (/^#[0-9A-F]{3}$/.test(hex)) {
		return `#${hex
			.slice(1)
			.split("")
			.map((part) => `${part}${part}`)
			.join("")}`;
	}
	if (/^#[0-9A-F]{6}$/.test(hex) || /^#[0-9A-F]{8}$/.test(hex)) {
		return hex;
	}
	throw new Error(`Unsupported hex color ${value}`);
}

function normalizeVarValue(value: string): string {
	const trimmed = value.trim();
	return HEX_RE.test(trimmed) ? normalizeHex(trimmed) : trimmed;
}

function resolveColor(theme: Record<string, string>, token: string, seen = new Set<string>()): string {
	const value = theme[token];
	assert.ok(value, `${token} is missing`);
	if (HEX_RE.test(value)) {
		return normalizeHex(value);
	}
	const ref = value.match(VAR_REF_RE);
	assert.ok(ref, `${token} must resolve to a hex color or var() reference, got ${value}`);
	assert.ok(!seen.has(token), `${token} contains a circular var() reference`);
	seen.add(token);
	return resolveColor(theme, ref[1], seen);
}

function hexToRgb(hex: string): readonly [number, number, number] {
	const normalized = normalizeHex(hex);
	return [
		Number.parseInt(normalized.slice(1, 3), 16),
		Number.parseInt(normalized.slice(3, 5), 16),
		Number.parseInt(normalized.slice(5, 7), 16),
	] as const;
}

function hexToRgba(hex: string): readonly [number, number, number, number] {
	const normalized = normalizeHexWithAlpha(hex);
	const alpha = normalized.length === 9 ? Number.parseInt(normalized.slice(7, 9), 16) / 255 : 1;
	return [
		Number.parseInt(normalized.slice(1, 3), 16),
		Number.parseInt(normalized.slice(3, 5), 16),
		Number.parseInt(normalized.slice(5, 7), 16),
		alpha,
	] as const;
}

function rgbToHex(red: number, green: number, blue: number): string {
	return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function blendOver(foreground: string, background: string): string {
	const [red, green, blue, alpha] = hexToRgba(foreground);
	const [bgRed, bgGreen, bgBlue] = hexToRgb(background);
	return rgbToHex(
		red * alpha + bgRed * (1 - alpha),
		green * alpha + bgGreen * (1 - alpha),
		blue * alpha + bgBlue * (1 - alpha),
	);
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

function parseTerminalThemeColors(path: string): Map<string, TerminalThemeColors> {
	const source = readFileSync(path, "utf8");
	const themes = new Map<string, TerminalThemeColors>();
	for (const block of source.matchAll(TERMINAL_THEME_BLOCK_RE)) {
		const themeId = block[1] ?? block[2];
		if (!themeId) continue;
		const colors: Partial<TerminalThemeColors> = {};
		for (const prop of block[3].matchAll(TERMINAL_THEME_PROP_RE)) {
			colors[prop[1] as keyof TerminalThemeColors] = normalizeHexWithAlpha(prop[2]);
		}
		if (Object.keys(colors).length > 0) {
			themes.set(themeId, colors as TerminalThemeColors);
		}
	}
	return themes;
}

test("Kanban and VCS theme CSS expose matching color token keys", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	const vcs = parseThemeCss(VCS_CSS_PATH);
	assert.deepEqual(sortedKeys(kanban.base), sortedKeys(vcs.base), "base @theme color tokens drifted");
	for (const token of SELECTED_TOKEN_NAMES) {
		assert.equal(kanban.root[token], vcs.root[token], `${token} selected root token drifted`);
	}
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

test("all theme accent and selected state pairs meet contrast requirements", () => {
	const kanban = parseThemeCss(KANBAN_CSS_PATH);
	const vcs = parseThemeCss(VCS_CSS_PATH);
	assert.deepEqual(themeIds(kanban).sort(), themeIds(vcs).sort(), "resolved theme id lists drifted");
	for (const themeId of themeIds(kanban)) {
		const kanbanTheme = resolveTheme(kanban, themeId);
		const vcsTheme = resolveTheme(vcs, themeId);
		for (const token of SELECTED_TOKEN_NAMES) {
			assert.equal(resolveColor(kanbanTheme, token), resolveColor(vcsTheme, token), `${themeId} ${token} drifted`);
		}
		assertContrast({
			themeId,
			foregroundName: "--color-accent-fg",
			backgroundName: "--color-accent",
			foreground: resolveColor(kanbanTheme, "--color-accent-fg"),
			background: resolveColor(kanbanTheme, "--color-accent"),
			minimum: 4.5,
		});
		assertContrast({
			themeId,
			foregroundName: "--color-accent-2-fg",
			backgroundName: "--color-accent-2",
			foreground: resolveColor(kanbanTheme, "--color-accent-2-fg"),
			background: resolveColor(kanbanTheme, "--color-accent-2"),
			minimum: 4.5,
		});
		for (const selectedTextToken of ["--kb-selected-fg", "--kb-selected-muted-fg"]) {
			assertContrast({
				themeId,
				foregroundName: selectedTextToken,
				backgroundName: "--kb-selected-bg",
				foreground: resolveColor(kanbanTheme, selectedTextToken),
				background: resolveColor(kanbanTheme, "--kb-selected-bg"),
				minimum: 4.5,
			});
		}
		for (const surfaceToken of [
			"--color-surface-0",
			"--color-surface-1",
			"--color-surface-2",
			"--color-surface-3",
		]) {
			assertContrast({
				themeId,
				foregroundName: "--kb-selected-border",
				backgroundName: surfaceToken,
				foreground: resolveColor(kanbanTheme, "--kb-selected-border"),
				background: resolveColor(kanbanTheme, surfaceToken),
				minimum: 3,
			});
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

test("selected state source avoids low-contrast selected text patterns", () => {
	const sourceRoots = [join(ROOT_DIR, "packages/kanban/web-ui/src"), join(ROOT_DIR, "packages/vcs/src")];
	const violations: string[] = [];
	const forbiddenPatterns = [
		[/text-accent-fg\/60/, "transparent selected foreground utility"],
		[/color-mix\(in srgb,\s*var\(--color-accent-fg\)\s+\d+%/, "transparent selected accent foreground mix"],
		[/color-mix\(in srgb,\s*white\s+20%/, "hard-coded white selected badge mix"],
	] as const;
	for (const sourceRoot of sourceRoots) {
		for (const filePath of walkSourceFiles(sourceRoot)) {
			const source = readFileSync(filePath, "utf8");
			for (const [pattern, label] of forbiddenPatterns) {
				if (pattern.test(source)) {
					violations.push(`${relative(ROOT_DIR, filePath)} contains ${label}`);
				}
			}
		}
	}
	assert.deepEqual(violations, []);
});

test("terminal theme selections meet contrast requirements", () => {
	const kanbanThemes = parseTerminalThemeColors(KANBAN_THEME_TS_PATH);
	const vcsThemes = parseTerminalThemeColors(VCS_THEME_TS_PATH);
	assert.deepEqual([...kanbanThemes.keys()].sort(), themeIds(parseThemeCss(KANBAN_CSS_PATH)).sort(), "Kanban terminal theme ids drifted");
	assert.deepEqual([...vcsThemes.keys()].sort(), [...kanbanThemes.keys()].sort(), "VCS terminal theme ids drifted");
	for (const [themeId, theme] of kanbanThemes) {
		const vcsTheme = vcsThemes.get(themeId);
		assert.ok(vcsTheme, `VCS terminal theme ${themeId} is missing`);
		assert.deepEqual(theme, vcsTheme, `${themeId} terminal colors drifted`);
		const activeSelectionBackground = blendOver(theme.selectionBackground, theme.surfacePrimary);
		const inactiveSelectionBackground = blendOver(theme.selectionInactiveBackground, theme.surfacePrimary);
		assertContrast({
			themeId,
			foregroundName: "terminal textPrimary",
			backgroundName: "terminal surfacePrimary",
			foreground: theme.textPrimary,
			background: theme.surfacePrimary,
			minimum: 4.5,
		});
		assertContrast({
			themeId,
			foregroundName: "terminal selectionForeground",
			backgroundName: "terminal selectionBackground",
			foreground: theme.selectionForeground,
			background: activeSelectionBackground,
			minimum: 4.5,
		});
		assertContrast({
			themeId,
			foregroundName: "terminal textPrimary",
			backgroundName: "terminal selectionInactiveBackground",
			foreground: theme.textPrimary,
			background: inactiveSelectionBackground,
			minimum: 4.5,
		});
	}
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
