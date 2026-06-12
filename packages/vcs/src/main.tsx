import ReactDOM from "react-dom/client";
import App from "@/App";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element was not found.");
}

ReactDOM.createRoot(root).render(
	<AppErrorBoundary>
		<TooltipProvider>
			<App />
		</TooltipProvider>
	</AppErrorBoundary>,
);
