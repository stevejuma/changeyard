import "@xterm/xterm/css/xterm.css";

import { CircleStop, Eraser, Terminal, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { RuntimeShellSessionStartResponse, RuntimeTaskSessionSummary } from "@/runtime/types";
import { postTrpcMutation } from "@/runtime/trpc-client";
import { usePersistentTerminalSession } from "@/terminal/use-persistent-terminal-session";
import { getTerminalThemeColors, useTheme } from "@/utils/vcs-theme";

const VCS_CONSOLE_TASK_ID = "__vcs_console__";

export function VcsConsolePanel({
	workspaceId,
	workspaceName,
	onClose,
}: {
	workspaceId: string | null;
	workspaceName: string | null;
	onClose: () => void;
}): React.ReactElement {
	const { themeId } = useTheme();
	const terminalTheme = getTerminalThemeColors(themeId);
	const [startResponse, setStartResponse] = useState<RuntimeShellSessionStartResponse | null>(null);
	const [summary, setSummary] = useState<RuntimeTaskSessionSummary | null>(null);
	const [startError, setStartError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setStartResponse(null);
		setSummary(null);
		setStartError(null);
		if (!workspaceId) {
			return;
		}
		setIsStarting(true);
		void postTrpcMutation<RuntimeShellSessionStartResponse>(
			"runtime.startShellSession",
			{
				taskId: VCS_CONSOLE_TASK_ID,
				baseRef: "HEAD",
				cols: 120,
				rows: 28,
			},
			workspaceId,
		)
			.then((response) => {
				if (cancelled) {
					return;
				}
				setStartResponse(response);
				setSummary(response.summary);
				setStartError(response.ok ? null : response.error ?? "Could not start shell.");
			})
			.catch((error: unknown) => {
				if (cancelled) {
					return;
				}
				setStartError(error instanceof Error ? error.message : "Could not start shell.");
			})
			.finally(() => {
				if (!cancelled) {
					setIsStarting(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	const terminal = usePersistentTerminalSession({
		taskId: VCS_CONSOLE_TASK_ID,
		workspaceId,
		enabled: Boolean(workspaceId && startResponse?.ok),
		onSummary: setSummary,
		autoFocus: true,
		isVisible: true,
		sessionStartedAt: summary?.startedAt ?? null,
		terminalBackgroundColor: terminalTheme.surfaceRaised,
		cursorColor: terminalTheme.textPrimary,
	});
	const errorMessage = startError ?? terminal.lastError;

	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-1" data-testid="vcs-console-panel">
			<header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-divider px-3">
				<div className="flex min-w-0 items-center gap-2">
					<Terminal size={15} className="shrink-0 text-text-tertiary" />
					<div className="min-w-0">
						<div className="truncate text-xs font-semibold text-text-primary">
							{workspaceName ?? "No project selected"}
						</div>
						{startResponse?.shellBinary || errorMessage ? (
							<div className="flex min-w-0 items-center gap-2 text-[11px] text-text-tertiary">
								{startResponse?.shellBinary ? <code className="truncate">{startResponse.shellBinary}</code> : null}
								{errorMessage ? <span className="truncate text-status-red">{errorMessage}</span> : null}
							</div>
						) : null}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						icon={<Eraser size={14} />}
						aria-label="Clear console"
						title="Clear console"
						onClick={terminal.clearTerminal}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={terminal.isStopping ? <Spinner size={14} /> : <CircleStop size={14} />}
						aria-label="Stop console session"
						title="Stop console session"
						disabled={terminal.isStopping || !startResponse?.ok}
						onClick={() => void terminal.stopTerminal()}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={<X size={14} />}
						aria-label="Close console"
						title="Close console"
						onClick={onClose}
					/>
				</div>
			</header>
			<div className="min-h-0 flex-1 bg-surface-1">
				{!workspaceId ? (
					<div className="flex h-full items-center justify-center text-[13px] text-text-tertiary">
						Select a project to open a console.
					</div>
				) : startResponse?.ok ? (
					<div
						ref={terminal.containerRef}
						className="kb-terminal-container h-full w-full"
						style={{ background: terminalTheme.surfaceRaised }}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-[13px] text-text-tertiary">
						{isStarting ? "Starting console..." : errorMessage ?? "Console unavailable."}
					</div>
				)}
			</div>
		</section>
	);
}
