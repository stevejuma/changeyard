import { contextBridge, ipcRenderer } from "electron";

type ElectronShellMetrics = {
	workspaceSafeAreaLeft?: number;
};

function getShellMetrics(): ElectronShellMetrics {
	const prefix = "--changeyard-shell-metrics=";
	const encoded = process.argv.find((argument) => argument.startsWith(prefix));
	if (!encoded) return {};

	try {
		const parsed = JSON.parse(
			decodeURIComponent(encoded.slice(prefix.length)),
		) as ElectronShellMetrics;
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

function applyShellMetrics(metrics: ElectronShellMetrics): void {
	if (typeof metrics.workspaceSafeAreaLeft !== "number") return;

	document.documentElement.style.setProperty(
		"--changeyard-safe-area-left",
		`${metrics.workspaceSafeAreaLeft}px`,
	);
}

applyShellMetrics(getShellMetrics());

const desktopApi = {
	platform: process.platform,

	openProjectWindow(projectId: string): void {
		ipcRenderer.send("open-project-window", projectId);
	},

	restartRuntime(): void {
		ipcRenderer.send("restart-runtime");
	},
} as const;

contextBridge.exposeInMainWorld("desktop", desktopApi);

export type DesktopApi = typeof desktopApi;
