import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeTaskSessionSummary } from "@/runtime/types";
import { disposePersistentTerminal, ensurePersistentTerminal } from "@/terminal/persistent-terminal-manager";
import { getTerminalThemeColors, useTheme } from "@/utils/vcs-theme";

type UsePersistentTerminalSessionInput = {
	taskId: string;
	workspaceId: string | null;
	enabled?: boolean;
	onSummary?: (summary: RuntimeTaskSessionSummary) => void;
	autoFocus?: boolean;
	isVisible?: boolean;
	sessionStartedAt?: number | null;
	terminalBackgroundColor: string;
	cursorColor: string;
};

export type UsePersistentTerminalSessionResult = {
	containerRef: MutableRefObject<HTMLDivElement | null>;
	lastError: string | null;
	isStopping: boolean;
	clearTerminal: () => void;
	stopTerminal: () => Promise<void>;
};

export function usePersistentTerminalSession({
	taskId,
	workspaceId,
	enabled = true,
	onSummary,
	autoFocus = false,
	isVisible = true,
	sessionStartedAt = null,
	terminalBackgroundColor,
	cursorColor,
}: UsePersistentTerminalSessionInput): UsePersistentTerminalSessionResult {
	const { themeId } = useTheme();
	const themeColors = useMemo(() => getTerminalThemeColors(themeId), [themeId]);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const terminalRef = useRef<ReturnType<typeof ensurePersistentTerminal> | null>(null);
	const callbackRef = useRef<{ onSummary?: (summary: RuntimeTaskSessionSummary) => void }>({ onSummary });
	const previousSessionRef = useRef<{ workspaceId: string; taskId: string; sessionStartedAt: number | null } | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);
	const [isStopping, setIsStopping] = useState(false);
	callbackRef.current = { onSummary };

	useEffect(() => {
		if (!enabled || !workspaceId) {
			const previousSession = previousSessionRef.current;
			if (previousSession) {
				disposePersistentTerminal(previousSession.workspaceId, previousSession.taskId);
			}
			terminalRef.current?.unmount(containerRef.current);
			terminalRef.current = null;
			previousSessionRef.current = null;
			setLastError(workspaceId ? null : "No project selected.");
			setIsStopping(false);
			return;
		}
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const previousSession = previousSessionRef.current;
		const didSessionRestart =
			previousSession !== null &&
			previousSession.workspaceId === workspaceId &&
			previousSession.taskId === taskId &&
			previousSession.sessionStartedAt !== sessionStartedAt;
		if (didSessionRestart) {
			disposePersistentTerminal(workspaceId, taskId);
		}
		const terminal = ensurePersistentTerminal({
			taskId,
			workspaceId,
			cursorColor,
			terminalBackgroundColor,
			themeColors,
		});
		previousSessionRef.current = {
			workspaceId,
			taskId,
			sessionStartedAt,
		};
		terminalRef.current = terminal;
		const unsubscribe = terminal.subscribe({
			onLastError: setLastError,
			onSummary: (summary) => callbackRef.current.onSummary?.(summary),
		});
		terminal.mount(
			container,
			{
				cursorColor,
				terminalBackgroundColor,
				themeColors,
			},
			{
				autoFocus,
				isVisible,
			},
		);
		setLastError(null);
		setIsStopping(false);
		return () => {
			unsubscribe();
			terminal.unmount(container);
			if (terminalRef.current === terminal) {
				terminalRef.current = null;
			}
		};
	}, [
		autoFocus,
		cursorColor,
		enabled,
		isVisible,
		sessionStartedAt,
		taskId,
		terminalBackgroundColor,
		themeColors,
		workspaceId,
	]);

	const stopTerminal = useCallback(async () => {
		const terminal = terminalRef.current;
		if (!terminal) {
			return;
		}
		setIsStopping(true);
		try {
			await terminal.stop();
		} finally {
			setIsStopping(false);
		}
	}, []);

	const clearTerminal = useCallback(() => {
		terminalRef.current?.clear();
	}, []);

	return {
		containerRef,
		lastError,
		isStopping,
		clearTerminal,
		stopTerminal,
	};
}
