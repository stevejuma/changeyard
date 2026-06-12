import { resolveVcsRoute } from "@/routes";
import type { VcsDetectResponse, VcsJjDiffResponse, VcsJjStateResponse } from "@/runtime/types";
import { useTrpcQuery } from "@/runtime/trpc-client";
import { BranchesView } from "@/views/branches-view";
import { HistoryView } from "@/views/history-view";
import { JjBoardView } from "@/views/jj-board-view";
import { LandingView } from "@/views/landing-view";
import { SettingsView } from "@/views/settings-view";

export default function App(): React.ReactElement {
	const currentPath = window.location.pathname;
	const route = resolveVcsRoute(currentPath);
	const detectQuery = useTrpcQuery<VcsDetectResponse>("vcs.detect", "Failed to load VCS detection.");
	const jjDiffQuery = useTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", "Failed to load JJ diff.");
	const jjStateQuery = useTrpcQuery<VcsJjStateResponse>("vcs.jjState", "Failed to load JJ state.");

	switch (route.kind) {
		case "jj-board":
			return (
				<JjBoardView
					currentPath={currentPath}
					state={jjStateQuery.state}
					refreshState={jjStateQuery.refresh}
					diffState={jjDiffQuery.state}
					refreshDiff={jjDiffQuery.refresh}
				/>
			);
		case "jj-branches":
			return <BranchesView currentPath={currentPath} state={jjStateQuery.state} />;
		case "jj-history":
			return <HistoryView currentPath={currentPath} state={jjStateQuery.state} />;
		case "settings":
			return <SettingsView currentPath={currentPath} state={detectQuery.state} />;
		default:
			return <LandingView currentPath={currentPath} state={detectQuery.state} />;
	}
}
