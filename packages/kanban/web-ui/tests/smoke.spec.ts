import { expect, type Page, test } from "@playwright/test";

async function openKanban(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.setItem("kanban.onboarding.dialog.shown", "true");
	});
	await page.goto("/kanban/changeyard");
}

async function openFirstChangeDetail(page: Page) {
	const detailButton = page.getByRole("button", { name: /^View details for CY-/ }).first();
	await expect(detailButton).toBeVisible();
	await detailButton.click();
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	return dialog;
}

test("renders kanban top bar and columns", async ({ page }) => {
	await openKanban(page);
	await expect(page).toHaveTitle(/Kanban/);
	await expect(page.getByRole("button", { name: "Projects" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Agent" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole("button", { name: /Backlog column/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /In Progress column/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Review \/ PR column/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Done column/ })).toBeVisible();
});

test("change action opens the new change dialog", async ({ page }) => {
	await openKanban(page);
	await page.getByRole("button", { name: "Change", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("New change", { exact: true })).toBeVisible();
	await expect(dialog.getByPlaceholder("Describe the change...")).toBeVisible();
	await expect(dialog.getByRole("button", { name: /Create/ })).toBeDisabled();
});

test("escape key closes an open change detail dialog", async ({ page }) => {
	await openKanban(page);
	const dialog = await openFirstChangeDetail(page);
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
});

test("persistent toasts can be dismissed while a change detail dialog is open", async ({ page }) => {
	await openKanban(page);
	await openFirstChangeDetail(page);
	await expect(page.locator("body")).toHaveCSS("pointer-events", "none");

	await page.evaluate(async () => {
		const mod = (await new Function("return import('/src/components/app-toaster.ts')")()) as typeof import("../src/components/app-toaster");
		mod.showAppToast(
			{ intent: "warning", message: "Toast close verification", timeout: 7000 },
			"e2e-toast-close-verification",
		);
	});

	const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Toast close verification" });
	await expect(toast).toBeVisible();
	await expect(toast).toHaveCSS("pointer-events", "auto");
	await page.getByRole("button", { name: "Close toast" }).click();
	await expect(toast).toHaveCount(0);
	await expect(page.getByRole("dialog")).toBeVisible();
});

test("settings button opens runtime settings dialog", async ({ page }) => {
	await openKanban(page);
	await page.getByTestId("open-settings-button").click();
	await expect(page.getByRole("dialog").getByText("Settings", { exact: true })).toBeVisible();
});
