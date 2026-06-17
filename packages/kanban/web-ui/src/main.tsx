import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { Toaster } from "sonner";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { PasscodeGateProvider } from "@/components/passcode-gate";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isThemeId } from "@/hooks/use-theme";
import { kanbanStore } from "@/runtime/kanban-store";
import "@changeyard/web-ui/styles.css";
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

const KanbanApp = lazy(() => import("@/App"));
const DashboardApp = lazy(() => import("@/Dashboard"));
const VcsApp = lazy(() => import("virtual:changeyard-vcs-route"));

type Surface = "dashboard" | "kanban" | "vcs";

function surfaceFromPathname(pathname: string): Surface {
	if (pathname === "/kanban" || pathname.startsWith("/kanban/")) {
		return "kanban";
	}
	if (pathname === "/vcs" || pathname.startsWith("/vcs/")) {
		return "vcs";
	}
	return "dashboard";
}

function prefetchSurface(pathname: string): void {
	const surface = surfaceFromPathname(pathname);
	if (surface === "kanban") {
		void import("@/App");
		return;
	}
	if (surface === "vcs") {
		void import("virtual:changeyard-vcs-route");
	}
}

function SurfaceLoading(): React.ReactElement {
	return (
		<div className="min-h-screen bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
			<div className="h-0.5 w-full overflow-hidden bg-[var(--color-surface-2)]">
				<div className="h-full w-1/3 animate-[changeyard-route-loading_1.1s_ease-in-out_infinite] bg-[var(--color-accent)]" />
			</div>
			<div className="mx-auto flex min-h-[calc(100vh-2px)] w-full max-w-6xl flex-col gap-4 px-6 py-6">
				<div className="h-8 w-48 rounded-md bg-[var(--color-surface-2)]" />
				<div className="grid gap-3 md:grid-cols-3">
					<div className="h-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)]" />
					<div className="h-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)]" />
					<div className="h-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)]" />
				</div>
				<div className="min-h-80 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)]" />
			</div>
		</div>
	);
}

function SurfaceRoot(): React.ReactElement {
	const [pathname, setPathname] = useState(() => window.location.pathname);
	const surface = surfaceFromPathname(pathname);
	const RootApp = useMemo(() => {
		if (surface === "kanban") {
			return KanbanApp;
		}
		if (surface === "vcs") {
			return VcsApp;
		}
		return DashboardApp;
	}, [surface]);

	useEffect(() => {
		document.getElementById("app-shell-fallback")?.remove();
	}, []);

	useEffect(() => {
		const syncPathname = () => setPathname(window.location.pathname);
		const handleClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) {
				return;
			}
			if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
				return;
			}
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			const anchor = target.closest("a[data-changeyard-surface-link]");
			if (!(anchor instanceof HTMLAnchorElement) || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) {
				return;
			}
			const url = new URL(anchor.href);
			if (url.origin !== window.location.origin) {
				return;
			}
			const nextPath = `${url.pathname}${url.search}${url.hash}`;
			const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
			event.preventDefault();
			if (nextPath !== currentPath) {
				window.history.pushState(null, "", nextPath);
			}
			syncPathname();
		};
		const handlePointerOver = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			const anchor = target.closest("a[data-changeyard-surface-link]");
			if (anchor instanceof HTMLAnchorElement && anchor.href) {
				prefetchSurface(new URL(anchor.href).pathname);
			}
		};
		window.addEventListener("popstate", syncPathname);
		window.addEventListener("changeyard:surface-navigate", syncPathname);
		document.addEventListener("click", handleClick);
		document.addEventListener("pointerover", handlePointerOver);
		return () => {
			window.removeEventListener("popstate", syncPathname);
			window.removeEventListener("changeyard:surface-navigate", syncPathname);
			document.removeEventListener("click", handleClick);
			document.removeEventListener("pointerover", handlePointerOver);
		};
	}, []);

	return (
		<Suspense fallback={<SurfaceLoading />}>
			<RootApp />
		</Suspense>
	);
}

ReactDOM.createRoot(root).render(
	<PasscodeGateProvider>
		<AppErrorBoundary>
			<Provider store={kanbanStore}>
				<TooltipProvider>
					<SurfaceRoot />
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
			</Provider>
		</AppErrorBoundary>
	</PasscodeGateProvider>,
);
