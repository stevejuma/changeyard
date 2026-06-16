import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { Toaster } from "sonner";

import App from "@/App";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { vcsStore } from "@/runtime/vcs-store";
import { applyThemeToDocument, readStoredThemeId } from "@/utils/vcs-theme";
import { VcsRouterProvider } from "@/utils/vcs-router";
import "@uiw/react-markdown-preview/markdown.css";
import "@changeyard/merge/styles.css";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element was not found.");
}

applyThemeToDocument(readStoredThemeId());

ReactDOM.createRoot(root).render(
	<AppErrorBoundary>
		<Provider store={vcsStore}>
			<TooltipProvider>
				<VcsRouterProvider>
					<App />
				</VcsRouterProvider>
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
	</AppErrorBoundary>,
);
