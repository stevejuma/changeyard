import { expect, type Page, test } from "@playwright/test";

const THEMES = [
	"default",
	"graphite",
	"midnight",
	"pitch",
	"solarized-dark",
	"light",
	"overcast",
	"solarized-light",
	"latte",
	"high-contrast-dark",
	"high-contrast-light",
] as const;

async function applyTheme(page: Page, theme: (typeof THEMES)[number]) {
	await page.addInitScript((themeId) => {
		if (themeId === "default") {
			window.localStorage.removeItem("kanban.theme");
			return;
		}
		window.localStorage.setItem("kanban.theme", themeId);
	}, theme);
}

async function installSelectedStateFixture(page: Page, theme: (typeof THEMES)[number]) {
	await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim().length > 0);
	await page.evaluate((themeId) => {
		if (themeId === "default") {
			document.documentElement.removeAttribute("data-theme");
		} else {
			document.documentElement.setAttribute("data-theme", themeId);
		}
		document.body.innerHTML = `
			<main class="min-h-screen bg-surface-0 p-6 text-text-primary">
				<aside class="w-80 bg-surface-1 p-3">
					<div class="kb-project-row kb-project-row-selected cursor-pointer rounded-md" style="display:flex;align-items:center;gap:6px;padding:6px 8px;">
						<div class="min-w-0 flex-1">
							<div class="kb-selected-fg overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">Kanban</div>
							<div class="kb-selected-muted-fg overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]">/tmp/changeyard</div>
							<span class="kb-selected-subtle-bg kb-selected-fg inline-flex rounded-full px-1.5 py-px text-[10px] font-medium">B 1</span>
						</div>
					</div>
				</aside>
				<section class="mt-6 grid max-w-5xl grid-cols-2 gap-4">
					<div class="kb-board-card-shell" data-task-id="fixture-task" data-selected="true">
						<div class="rounded-md border border-border-bright bg-surface-2 p-2.5">
							<h2 class="text-sm font-semibold text-text-primary">Selected board card</h2>
							<p class="text-xs text-text-secondary">Neutral card text stays readable behind a selected border.</p>
						</div>
					</div>
					<div class="overflow-hidden rounded-lg border border-divider bg-surface-2 kb-change-card-selected">
						<div class="px-3 py-2 text-sm font-semibold text-text-primary">Selected change card</div>
					</div>
					<button type="button" class="kb-file-tree-row kb-file-tree-row-selected" data-file-path="src/app.tsx">
						<span class="kb-file-type-icon"><span class="text-text-tertiary">T</span></span>
						<span class="min-w-0 flex-1 truncate">src/app.tsx</span>
						<span class="kb-file-status-glyph rounded px-1 text-[10px]">+3</span>
					</button>
					<div class="kb-git-ref-row kb-git-ref-row-selected rounded px-2 py-1">
						<button type="button" class="kb-git-ref-row-main" style="background:transparent;border:0;color:inherit;">main</button>
					</div>
					<button type="button" class="kb-git-commit-row kb-git-commit-row-selected flex gap-2 rounded px-2 py-1">
						<span class="kb-git-commit-row-message">Selected commit message</span>
						<span class="kb-git-commit-row-meta">abc1234</span>
					</button>
				</section>
			</main>
		`;
	}, theme);
}

function contrastDiagnostics() {
	function parseColor(value: string): [number, number, number] {
		const rgb = value.match(/^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/);
		if (rgb) {
			return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
		}
		const srgb = value.match(/^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
		if (srgb) {
			return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
		}
		throw new Error(`Unsupported color: ${value}`);
	}

	function luminance(value: string): number {
		const [red, green, blue] = parseColor(value).map((channel) => {
			const normalized = channel / 255;
			return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
	}

	function contrast(foreground: string, background: string): number {
		const first = luminance(foreground);
		const second = luminance(background);
		const lighter = Math.max(first, second);
		const darker = Math.min(first, second);
		return (lighter + 0.05) / (darker + 0.05);
	}

	const projectRow = document.querySelector<HTMLElement>(".kb-project-row-selected");
	const projectName = projectRow?.querySelector<HTMLElement>(".kb-selected-fg");
	const projectPath = projectRow?.querySelector<HTMLElement>(".kb-selected-muted-fg");
	const projectBadge = projectRow?.querySelector<HTMLElement>(".kb-selected-subtle-bg");
	const selectedCard = document.querySelector<HTMLElement>('[data-task-id][data-selected="true"]');
	const selectedCardBody = selectedCard?.firstElementChild as HTMLElement | null;
	const fileRow = document.querySelector<HTMLElement>(".kb-file-tree-row-selected");
	const fileGlyph = fileRow?.querySelector<HTMLElement>(".kb-file-status-glyph");
	const gitRef = document.querySelector<HTMLElement>(".kb-git-ref-row-selected");
	const gitCommit = document.querySelector<HTMLElement>(".kb-git-commit-row-selected");
	const gitCommitMessage = gitCommit?.querySelector<HTMLElement>(".kb-git-commit-row-message");
	const gitCommitMeta = gitCommit?.querySelector<HTMLElement>(".kb-git-commit-row-meta");
	if (
		!projectRow ||
		!projectName ||
		!projectPath ||
		!projectBadge ||
		!selectedCard ||
		!selectedCardBody ||
		!fileRow ||
		!fileGlyph ||
		!gitRef ||
		!gitCommit ||
		!gitCommitMessage ||
		!gitCommitMeta
	) {
		throw new Error("Expected selected fixture elements to be visible.");
	}

	const projectRowStyle = getComputedStyle(projectRow);
	const projectNameStyle = getComputedStyle(projectName);
	const projectPathStyle = getComputedStyle(projectPath);
	const projectBadgeStyle = getComputedStyle(projectBadge);
	const cardStyle = getComputedStyle(selectedCard);
	const cardBodyStyle = getComputedStyle(selectedCardBody);
	const fileRowStyle = getComputedStyle(fileRow);
	const fileGlyphStyle = getComputedStyle(fileGlyph);
	const gitRefStyle = getComputedStyle(gitRef);
	const gitCommitStyle = getComputedStyle(gitCommit);
	const gitCommitMessageStyle = getComputedStyle(gitCommitMessage);
	const gitCommitMetaStyle = getComputedStyle(gitCommitMeta);

	return {
		projectName: contrast(projectNameStyle.color, projectRowStyle.backgroundColor),
		projectPath: contrast(projectPathStyle.color, projectRowStyle.backgroundColor),
		projectBadge: contrast(projectBadgeStyle.color, projectBadgeStyle.backgroundColor),
		selectedCardBorder: contrast(cardStyle.outlineColor, cardBodyStyle.backgroundColor),
		fileRowText: contrast(fileRowStyle.color, fileRowStyle.backgroundColor),
		fileGlyphText: contrast(fileGlyphStyle.color, fileGlyphStyle.backgroundColor),
		gitRefText: contrast(gitRefStyle.color, gitRefStyle.backgroundColor),
		gitCommitMessage: contrast(gitCommitMessageStyle.color, gitCommitStyle.backgroundColor),
		gitCommitMeta: contrast(gitCommitMetaStyle.color, gitCommitStyle.backgroundColor),
		projectRowBackground: projectRowStyle.backgroundColor,
		projectNameColor: projectNameStyle.color,
		projectPathColor: projectPathStyle.color,
		selectedCardOutline: cardStyle.outlineColor,
		selectedCardBackground: cardBodyStyle.backgroundColor,
	};
}

for (const theme of THEMES) {
	test(`selected Kanban theme contrast: ${theme}`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 920 });
		await applyTheme(page, theme);
		await page.goto("/kanban");
		await installSelectedStateFixture(page, theme);

		const desktopDiagnostics = await page.evaluate(contrastDiagnostics);
	expect(desktopDiagnostics.projectName, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
	expect(desktopDiagnostics.projectPath, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
	expect(desktopDiagnostics.projectBadge, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
	expect(desktopDiagnostics.selectedCardBorder, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(3);
		expect(desktopDiagnostics.fileRowText, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
		expect(desktopDiagnostics.fileGlyphText, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
		expect(desktopDiagnostics.gitRefText, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
		expect(desktopDiagnostics.gitCommitMessage, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
		expect(desktopDiagnostics.gitCommitMeta, JSON.stringify(desktopDiagnostics)).toBeGreaterThanOrEqual(4.5);
		await page.screenshot({ path: testInfo.outputPath(`${theme}-desktop.png`), fullPage: true });

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('[data-task-id][data-selected="true"]')).toBeVisible();
		await page.screenshot({ path: testInfo.outputPath(`${theme}-mobile.png`), fullPage: true });
	});
}
