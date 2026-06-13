import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const execFile = promisify(execFileCallback);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const fixtureScript = resolve(repoRoot, "scripts/create-vcs-jj-fixture.ts");

type FixtureMetadata = {
	repoPath: string;
	workspaceId: string;
	targetBranch: string;
};

type ProjectAddResponse = {
	result?: {
		data?: {
			ok: boolean;
			project: null | {
				id: string;
				path: string;
				name: string;
			};
			error?: string;
		};
	};
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createFixture(): Promise<{ tempDir: string; fixture: FixtureMetadata }> {
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-vcs-e2e-"));
	const repoPath = join(tempDir, "vcs-jj-fixture");
	const result = await execFile("node", ["--import", "tsx", fixtureScript, repoPath, "--force", "--json"], {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return {
		tempDir,
		fixture: JSON.parse(result.stdout) as FixtureMetadata,
	};
}

async function addProject(request: APIRequestContext, repoPath: string): Promise<string> {
	const response = await request.post("/api/trpc/projects.add", {
		data: { path: repoPath },
	});
	expect(response.ok()).toBeTruthy();
	const payload = (await response.json()) as ProjectAddResponse;
	const data = payload.result?.data;
	expect(data?.ok, data?.error ?? "Project add failed").toBe(true);
	expect(data?.project?.id).toBeTruthy();
	return data?.project?.id ?? "";
}

async function removeProject(request: APIRequestContext, projectId: string): Promise<void> {
	if (!projectId) {
		return;
	}
	await request.post("/api/trpc/projects.remove", {
		data: { projectId },
	});
}

async function openBranches(page: Page, workspaceId: string): Promise<void> {
	await page.goto(`/vcs/jj/branches?workspaceId=${encodeURIComponent(workspaceId)}`);
	await expect(page.getByText("Current workspace target", { exact: true })).toBeVisible();
}

async function openBranchesRef(page: Page, workspaceId: string, ref: string): Promise<void> {
	await page.goto(`/vcs/jj/branches?workspaceId=${encodeURIComponent(workspaceId)}&ref=${encodeURIComponent(ref)}`);
	await expect(page.getByText("Current workspace target", { exact: true })).toBeVisible();
}

async function openWorkspace(page: Page, workspaceId: string): Promise<void> {
	await page.goto(`/vcs/jj?workspaceId=${encodeURIComponent(workspaceId)}`);
	await expect(page.getByText("Working Copy", { exact: true })).toBeVisible();
}

async function openSettings(page: Page, workspaceId: string): Promise<void> {
	await page.goto(`/vcs/settings?workspaceId=${encodeURIComponent(workspaceId)}`);
	await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

test.describe.serial("VCS JJ fixture", () => {
	let tempDir = "";
	let workspaceId = "";
	let fixtureRepoPath = "";
	const addedProjectIds: string[] = [];

	test.beforeAll(async ({ request }) => {
		const created = await createFixture();
		tempDir = created.tempDir;
		fixtureRepoPath = created.fixture.repoPath;
		workspaceId = await addProject(request, fixtureRepoPath);
	});

	test.afterAll(async ({ request }) => {
		for (const projectId of addedProjectIds.splice(0)) {
			await removeProject(request, projectId);
		}
		await removeProject(request, workspaceId);
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("Branches derives local, dependent, and remote-only stack rows", async ({ page }) => {
		await openBranchesRef(page, workspaceId, "origin/main");

		await expect(page.getByText("document sample scenarios", { exact: true })).toBeVisible();

		await expect(page.getByText("feature/export-json", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/cloud-observability", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/cloud-runner", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/readme-polish", { exact: true })).toBeVisible();

		await page.getByText("feature/cloud-observability", { exact: true }).click();
		await expect(page.getByRole("button", { name: "add deployment health summary", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "add deployment preview command", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "prepare cloud deployment config", exact: true })).toBeVisible();
	});

	test("Workspace applies a stack and opens changed files and diff", async ({ page }) => {
		await openBranches(page, workspaceId);
		await page.getByText("feature/export-json", { exact: true }).click();
		await page.getByRole("button", { name: "Apply to workspace" }).click();
		await expect(page.getByRole("button", { name: "Unapply from workspace" })).toBeVisible();

		await openWorkspace(page, workspaceId);
		await expect(page.getByText("Working Copy", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/export-json", { exact: true })).toHaveCount(2);
		await expect(page.getByText("README.md", { exact: true })).toBeVisible();

		await page.getByText("add json report mode", { exact: true }).click();
		await expect(page.getByText("Changed files", { exact: true })).toBeVisible();
		await page.getByTestId("vcs-file-row").and(page.locator('[data-file-path="src/output.rs"]')).click();
		await expect(page).toHaveURL(/file=src%2Foutput\.rs/);
		await expect(page.getByTestId("vcs-file-diff-column").getByText("src/output.rs", { exact: true })).toBeVisible();
	});

	test("Top-level VCS navigation stays in the same browser document", async ({ page }) => {
		await openWorkspace(page, workspaceId);
		const probe = await page.evaluate(() => {
			const value = `probe-${Date.now()}`;
			(window as typeof window & { __changeyardSpaProbe?: string }).__changeyardSpaProbe = value;
			return value;
		});

		await page.getByRole("link", { name: "Branches" }).click();
		await expect(page.getByText("Current workspace target", { exact: true })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/vcs/jj/branches\\?workspaceId=${escapeRegExp(workspaceId)}`));
		await expect.poll(() => page.evaluate(() => (window as typeof window & { __changeyardSpaProbe?: string }).__changeyardSpaProbe)).toBe(probe);

		await page.getByRole("link", { name: "History" }).click();
		await expect(page.getByText("Operations history", { exact: true })).toBeVisible();
		await expect.poll(() => page.evaluate(() => (window as typeof window & { __changeyardSpaProbe?: string }).__changeyardSpaProbe)).toBe(probe);

		await page.getByRole("button", { name: "Open settings" }).click();
		await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/vcs/jj/history\\?workspaceId=${escapeRegExp(workspaceId)}`));
		await expect.poll(() => page.evaluate(() => (window as typeof window & { __changeyardSpaProbe?: string }).__changeyardSpaProbe)).toBe(probe);

		await page.goBack();
		await expect(page.getByText("Current workspace target", { exact: true })).toBeVisible();
		await expect.poll(() => page.evaluate(() => (window as typeof window & { __changeyardSpaProbe?: string }).__changeyardSpaProbe)).toBe(probe);
	});

	test("Project dialog adds a deterministic fixture project through directory browsing", async ({ page }) => {
		const repoPath = join(tempDir, "ui-added-vcs-jj-fixture");
		await execFile("node", ["--import", "tsx", fixtureScript, repoPath, "--force", "--clean", "--json"], {
			cwd: repoRoot,
			encoding: "utf8",
			maxBuffer: 10 * 1024 * 1024,
		});

		await openWorkspace(page, workspaceId);
		await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(fixtureRepoPath)) })).toBeVisible();
		await page.getByRole("button", { name: "Add Project" }).click();
		const dialog = page.getByRole("dialog", { name: "Add Project" });
		await expect(dialog).toBeVisible();

		const pathInput = page.getByRole("combobox", { name: "Server path input" });
		await pathInput.fill(repoPath);
		const projectOption = page.getByRole("option", { name: "ui-added-vcs-jj-fixture", exact: true });
		await expect(projectOption).toBeVisible();
		await projectOption.click();
		await dialog.getByRole("button", { name: "Add Project" }).click();

		await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(repoPath)) })).toBeVisible();
		await expect
			.poll(() => new URL(page.url()).searchParams.get("workspaceId"))
			.not.toBe(workspaceId);
		const addedWorkspaceId = new URL(page.url()).searchParams.get("workspaceId");
		expect(addedWorkspaceId).toBeTruthy();
		addedProjectIds.push(addedWorkspaceId ?? "");
	});

	test("Workspace refreshes working copy changes after external file edits", async ({ page }) => {
		await openWorkspace(page, workspaceId);
		await expect(page.getByText("Working Copy", { exact: true })).toBeVisible();

		const notesDir = join(fixtureRepoPath, "notes");
		await mkdir(notesDir, { recursive: true });
		await writeFile(join(notesDir, "live-refresh.md"), "# Live refresh\n\nUpdated outside the UI.\n");

		await expect(page.getByText("live-refresh.md", { exact: true })).toBeVisible();
	});

	test("Console opens and stops a runtime shell session", async ({ page }) => {
		await openWorkspace(page, workspaceId);

		await page.getByRole("button", { name: "Open console" }).click();
		await expect(page.getByTestId("vcs-console-panel")).toBeVisible();

		const stopButton = page.getByRole("button", { name: "Stop console session" });
		await expect(stopButton).toBeEnabled();
		await stopButton.click();
		await expect(stopButton).toBeDisabled();

		await page.getByTestId("vcs-console-panel").getByRole("button", { name: "Close console" }).click();
		await expect(page.getByTestId("vcs-console-panel")).toBeHidden();
	});

	test("Settings renders project config and target branch inventory", async ({ page }) => {
		await openSettings(page, workspaceId);
		await expect(page.getByText("Workspace target", { exact: true })).toBeVisible();
		await expect(page.getByRole("combobox", { name: "Workspace target branch" })).toContainText("origin/main");
	});

	test("History renders operation log and commit graph for the fixture", async ({ page }) => {
		await page.goto(`/vcs/jj/history?workspaceId=${encodeURIComponent(workspaceId)}`);
		await expect(page.getByText("Operations history", { exact: true })).toBeVisible();
		await expect(page.getByText("add deployment health summary", { exact: true })).toBeVisible();
		await expect(page.getByText("allow due date range queries", { exact: true })).toBeVisible();
	});
});
