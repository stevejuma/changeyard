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
const gitFixtureScript = resolve(repoRoot, "scripts/create-vcs-git-fixture.ts");

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

async function createGitFixture(): Promise<{ tempDir: string; fixture: FixtureMetadata }> {
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-vcs-git-e2e-"));
	const repoPath = join(tempDir, "vcs-git-fixture");
	const result = await execFile("node", ["--import", "tsx", gitFixtureScript, repoPath, "--force", "--clean", "--json"], {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	const fixture = JSON.parse(result.stdout) as FixtureMetadata;
	await execFile("git", ["switch", "feature/export-json"], {
		cwd: fixture.repoPath,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return { tempDir, fixture };
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

async function ensureStackApplied(page: Page, workspaceId: string, stackName: string): Promise<void> {
	await openBranches(page, workspaceId);
	await page.getByText(stackName, { exact: true }).click();
	const applyButton = page.getByRole("button", { name: "Apply to workspace" });
	const unapplyButton = page.getByRole("button", { name: "Unapply from workspace" });
	await expect(applyButton.or(unapplyButton)).toBeVisible();
	if (await applyButton.isVisible()) {
		await applyButton.click();
		const previewDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(previewDialog).toBeVisible();
		await previewDialog.getByRole("button", { name: "Apply operation" }).click();
		await expect(previewDialog).toBeHidden();
		await expect(unapplyButton).toBeVisible();
	}
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

	test("Workspace applies and unapplies a stack and opens changed files and diff", async ({ page }) => {
		await openBranches(page, workspaceId);
		await page.getByText("feature/export-json", { exact: true }).click();
		await page.getByRole("button", { name: "Apply to workspace" }).click();
		const applyDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(applyDialog).toBeVisible();
		await expect(applyDialog.getByText(/Apply stack/i)).toBeVisible();
		await applyDialog.getByRole("button", { name: "Apply operation" }).click();
		await expect(applyDialog).toBeHidden();
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

		await page.getByRole("button", { name: "Unapply feature/export-json" }).click();
		const unapplyDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(unapplyDialog).toBeVisible();
		await expect(unapplyDialog.getByText(/Unapply stack/i)).toBeVisible();
		await unapplyDialog.getByRole("button", { name: "Apply operation" }).click();
		await expect(unapplyDialog).toBeHidden();
		await expect(page.getByText("No stacks applied", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/export-json", { exact: true })).toHaveCount(0);
	});

	test("Workspace previews and applies a neutral commit message edit", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		const nextTitle = "add json report mode polished";
		await page.getByRole("button", { name: "Edit commit add json report mode" }).click();
		const editDialog = page.getByRole("dialog", { name: "Edit Commit Message" });
		await expect(editDialog).toBeVisible();
		await editDialog.getByLabel("Commit message").fill(nextTitle);
		await editDialog.getByRole("button", { name: "Preview changes" }).click();

		const previewDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(previewDialog).toBeVisible();
		await expect(previewDialog.getByText(/Update .* description/i)).toBeVisible();
		await previewDialog.getByRole("button", { name: "Apply operation" }).click();
		await expect(previewDialog).toBeHidden();
		await expect(page.getByText(nextTitle, { exact: true })).toBeVisible();
		await expect(page.getByText("add json report mode", { exact: true })).toBeHidden();

		await openBranchesRef(page, workspaceId, "origin/main");
		await page.getByText("feature/export-json", { exact: true }).click();
		await expect(page.getByRole("button", { name: nextTitle, exact: true })).toBeVisible();
	});

	test("Workspace drag and drop previews a neutral file-to-commit operation", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		const source = page.getByTestId("vcs-working-copy-file-row").and(page.locator('[data-file-path="README.md"]'));
		const target = page.getByTestId("vcs-workspace-commit-card").filter({ hasText: "add serde task serialization" });
		await expect(source).toBeVisible();
		await expect(target).toBeVisible();

		await source.dragTo(target);

		const dialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Paths", { exact: true })).toBeVisible();
		await expect(dialog.getByText("README.md", { exact: true })).toBeVisible();
		await expect(dialog.getByText("This drop target does not accept the dragged item.", { exact: true })).toBeHidden();
	});

	test("Workspace drag and drop previews a committed file-to-commit operation", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		await page.getByText("add serde task serialization", { exact: true }).click();
		const source = page.getByTestId("vcs-file-row").and(page.locator('[data-file-path="Cargo.toml"]')).first();
		const target = page.getByTestId("vcs-workspace-commit-card").filter({ hasText: /add json report mode(?: polished)?/ });
		await expect(source).toBeVisible();
		await expect(target).toBeVisible();

		await source.dragTo(target);

		const dialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Paths", { exact: true })).toBeVisible();
		await expect(dialog.getByText("Cargo.toml", { exact: true })).toBeVisible();
		await expect(dialog.getByText(/Move Cargo\.toml from .* into .*/i)).toBeVisible();
		await expect(dialog.getByText("This drop target does not accept the dragged item.", { exact: true })).toBeHidden();
	});

	test("Workspace drag and drop previews a committed file-to-working-copy operation", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		await page.getByText(/add json report mode(?: polished)?/).click();
		const source = page.getByTestId("vcs-file-row").and(page.locator('[data-file-path="src/output.rs"]')).first();
		const target = page.getByTestId("vcs-working-copy-drop-target");
		await expect(source).toBeVisible();
		await expect(target).toBeVisible();

		await source.dragTo(target);

		const dialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Paths", { exact: true })).toBeVisible();
		await expect(dialog.getByText("src/output.rs", { exact: true })).toBeVisible();
		await expect(dialog.getByText(/Move src\/output\.rs from .* into @/i)).toBeVisible();
		await expect(dialog.getByText("Only committed changes can be moved back to the working copy.", { exact: true })).toBeHidden();
	});

	test("Workspace hunk drag previews an enabled committed hunk-to-commit operation", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		await page.getByText("add serde task serialization", { exact: true }).click();
		await page.getByTestId("vcs-file-row").and(page.locator('[data-file-path="src/tasks.rs"]')).first().click();
		const source = page.getByTestId("vcs-diff-hunk").and(page.locator('[data-file-path="src/tasks.rs"]')).first();
		const target = page.getByTestId("vcs-workspace-commit-card").filter({ hasText: /add json report mode(?: polished)?/ });
		await expect(source).toBeVisible();
		await expect(target).toBeVisible();
		await expect(target).toHaveAttribute("data-drop-target-state", "idle");

		await source.evaluate((element) => {
			const dataTransfer = new DataTransfer();
			(window as typeof window & { __changeyardHunkDrag?: DataTransfer }).__changeyardHunkDrag = dataTransfer;
			element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
		});
		await target.evaluate((element) => {
			const dataTransfer = (window as typeof window & { __changeyardHunkDrag?: DataTransfer }).__changeyardHunkDrag;
			if (!dataTransfer) {
				throw new Error("Missing hunk drag DataTransfer.");
			}
			element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
		});
		await expect(target).toHaveAttribute("data-drop-target-state", "valid");
		await target.evaluate((element) => {
			const dataTransfer = (window as typeof window & { __changeyardHunkDrag?: DataTransfer }).__changeyardHunkDrag;
			if (!dataTransfer) {
				throw new Error("Missing hunk drag DataTransfer.");
			}
			element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
		});
		await source.evaluate((element) => {
			const dataTransfer = (window as typeof window & { __changeyardHunkDrag?: DataTransfer }).__changeyardHunkDrag;
			element.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
			delete (window as typeof window & { __changeyardHunkDrag?: DataTransfer }).__changeyardHunkDrag;
		});
		const dialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("Paths", { exact: true })).toBeVisible();
		await expect(dialog.getByText("src/tasks.rs", { exact: true })).toBeVisible();
		await expect(dialog.getByText(/Move 1 selected hunk\(s\) from .* into .*/i)).toBeVisible();
		await expect(dialog.getByText("This drop target does not accept the dragged item.", { exact: true })).toBeHidden();
	});

	test("Workspace visibly marks invalid drop targets while dragging", async ({ page }) => {
		await ensureStackApplied(page, workspaceId, "feature/export-json");
		await openWorkspace(page, workspaceId);

		const source = page.getByTestId("vcs-working-copy-file-row").and(page.locator('[data-file-path="README.md"]'));
		const invalidTarget = page.getByTestId("vcs-working-copy-drop-target");
		await expect(source).toBeVisible();
		await expect(invalidTarget).toHaveAttribute("data-drop-target-state", "idle");

		const sourceBox = await source.boundingBox();
		const targetBox = await invalidTarget.boundingBox();
		expect(sourceBox).toBeTruthy();
		expect(targetBox).toBeTruthy();
		if (!sourceBox || !targetBox) {
			return;
		}

		await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + Math.min(targetBox.height - 12, sourceBox.height * 3), {
			steps: 10,
		});

		await expect(invalidTarget).toHaveAttribute("data-drop-target-state", "invalid");
		await page.mouse.up();
		await expect(invalidTarget).toHaveAttribute("data-drop-target-state", "idle");
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

test.describe.serial("VCS Git fixture", () => {
	let tempDir = "";
	let workspaceId = "";
	let fixtureRepoPath = "";

	test.beforeAll(async ({ request }) => {
		const created = await createGitFixture();
		tempDir = created.tempDir;
		fixtureRepoPath = created.fixture.repoPath;
		workspaceId = await addProject(request, created.fixture.repoPath);
	});

	test.afterAll(async ({ request }) => {
		await removeProject(request, workspaceId);
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("Workspace opens a normal Git repository and applies supported drag operations", async ({ page }) => {
		await openWorkspace(page, workspaceId);

		await expect(page.getByText("Working Copy", { exact: true })).toBeVisible();
		await expect(page.getByTestId("vcs-workspace-stack-drop-target").getByText("feature/export-json", { exact: true })).toBeVisible();
		await expect(page.getByText("add serde task serialization", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Edit commit add serde task serialization" })).toBeEnabled();
		await expect(page.getByRole("button", { name: "Edit commit add json report mode" })).toBeDisabled();

		await page.getByRole("button", { name: "Unapply feature/export-json" }).click();
		const previewDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(previewDialog).toBeVisible();
		await expect(previewDialog.getByText(/Unapply stack by switching to main/i)).toBeVisible();
		await expect(previewDialog.getByText("medium", { exact: true })).toBeVisible();
		await previewDialog.getByRole("button", { name: "Close" }).click();
		await expect(previewDialog).toBeHidden();

		await writeFile(
			join(fixtureRepoPath, "README.md"),
			"# VCS Git fixture\n\nA deterministic repository for normal Git VCS tests.\n\nLocal Git drag/drop preview.\n",
		);
		await openWorkspace(page, workspaceId);
		const source = page.getByTestId("vcs-working-copy-file-row").and(page.locator('[data-file-path="README.md"]'));
		const target = page.getByTestId("vcs-workspace-commit-card").filter({ hasText: "add serde task serialization" });
		await expect(source).toBeVisible();
		await expect(target).toBeVisible();

		await source.dragTo(target);

		const amendDialog = page.getByRole("dialog", { name: "Workspace Operation" });
		await expect(amendDialog).toBeVisible();
		await expect(amendDialog.getByText("README.md", { exact: true })).toBeVisible();
		await expect(amendDialog.getByText(/Amend .* with 1 selected path/i)).toBeVisible();
		await amendDialog.getByRole("button", { name: "Apply operation" }).click();
		await expect(amendDialog).toBeHidden();
		await expect(page.getByTestId("vcs-working-copy-file-row").and(page.locator('[data-file-path="README.md"]'))).toBeHidden();
		await expect(page.getByTestId("vcs-file-row").and(page.locator('[data-file-path="README.md"]'))).toBeVisible();
		await expect(page.getByTestId("vcs-file-diff-column").getByText("README.md", { exact: true })).toBeVisible();
	});

	test("Branches renders normal Git branch inventory", async ({ page }) => {
		await page.goto(`/vcs/jj/branches?workspaceId=${encodeURIComponent(workspaceId)}`);
		await expect(page.getByRole("main").getByText("Branches", { exact: true })).toBeVisible();
		await expect(page.getByText("feature/export-json", { exact: true })).toBeVisible();
		await page.getByText("feature/export-json", { exact: true }).click();
		await expect(page.getByRole("button", { name: "add serde task serialization", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Unapply from workspace" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Delete local" })).toBeDisabled();
		await expect(page.getByText("This ref is not part of an active local stack.", { exact: true })).toBeHidden();
	});
});
