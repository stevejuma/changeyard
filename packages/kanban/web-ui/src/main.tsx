import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { PasscodeGateProvider } from "@/components/passcode-gate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isThemeId } from "@/hooks/use-theme";
import "@uiw/react-markdown-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import "@/styles/globals.css";

// Apply the persisted theme synchronously before first paint to prevent a flash.
try {
	const _savedTheme = localStorage.getItem("kanban.theme");
	if (isThemeId(_savedTheme) && _savedTheme !== "default") {
		document.documentElement.setAttribute("data-theme", _savedTheme);
	}
} catch {
	// Ignore storage access failures and keep the default theme.
}

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element was not found.");
}

const RootApp = lazy(() =>
	window.location.pathname === "/kanban" || window.location.pathname.startsWith("/kanban/")
		? import("@/App")
		: window.location.pathname === "/vcs" || window.location.pathname.startsWith("/vcs/")
			? import("virtual:changeyard-vcs-route")
			: import("@/Dashboard"),
);

ReactDOM.createRoot(root).render(
	<PasscodeGateProvider>
		<AppErrorBoundary>
			<TooltipProvider>
				<Suspense fallback={null}>
					<RootApp />
				</Suspense>
				<Toaster
					theme="dark"
					position="bottom-right"
					toastOptions={{
						style: {
							background: "var(--color-surface-1)",
							border: "1px solid var(--color-border)",
							color: "var(--color-text-primary)",
							fontSize: "13px",
							whiteSpace: "pre-line",
						},
					}}
				/>
			</TooltipProvider>
		</AppErrorBoundary>
	</PasscodeGateProvider>,
);
