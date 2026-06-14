import type { RuntimeStateStreamVcsProjectEventMessage } from "@/runtime/types";

type VcsProjectEventListener = (event: RuntimeStateStreamVcsProjectEventMessage) => void;

type WorkspaceEventConnection = {
	workspaceId: string;
	listeners: Set<VcsProjectEventListener>;
	socket: WebSocket | null;
	reconnectTimer: number | null;
	reconnectAttempt: number;
	closed: boolean;
};

const connections = new Map<string, WorkspaceEventConnection>();

function runtimeStreamUrl(workspaceId: string): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${protocol}//${window.location.host}/api/runtime/ws`);
	url.searchParams.set("workspaceId", workspaceId);
	url.searchParams.set("stream", "vcs");
	url.searchParams.set("surface", "vcs");
	return url.toString();
}

function isVcsProjectEventMessage(value: unknown): value is RuntimeStateStreamVcsProjectEventMessage {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<RuntimeStateStreamVcsProjectEventMessage>;
	return (
		candidate.type === "vcs_project_event" &&
		typeof candidate.workspaceId === "string" &&
		typeof candidate.topic === "string" &&
		(candidate.kind === "worktree_changes" ||
			candidate.kind === "vcs/activity" ||
			candidate.kind === "vcs/head" ||
			candidate.kind === "vcs/fetch") &&
		Array.isArray(candidate.paths) &&
		typeof candidate.changedAt === "number" &&
		typeof candidate.version === "number"
	);
}

function workspaceMetadataEvent(value: unknown, workspaceId: string): RuntimeStateStreamVcsProjectEventMessage | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as { type?: unknown; workspaceId?: unknown };
	if (candidate.type !== "workspace_metadata_updated" || candidate.workspaceId !== workspaceId) {
		return null;
	}
	const changedAt = Date.now();
	return {
		type: "vcs_project_event",
		workspaceId,
		topic: `project://${workspaceId}/worktree_changes`,
		kind: "worktree_changes",
		paths: [],
		changedAt,
		version: changedAt,
	};
}

function closeSocket(connection: WorkspaceEventConnection): void {
	if (connection.reconnectTimer !== null) {
		window.clearTimeout(connection.reconnectTimer);
		connection.reconnectTimer = null;
	}
	const socket = connection.socket;
	connection.socket = null;
	if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
		socket.close();
	}
}

function scheduleReconnect(connection: WorkspaceEventConnection): void {
	if (connection.closed || connection.listeners.size === 0 || connection.socket || connection.reconnectTimer !== null) {
		return;
	}
	const delay = Math.min(5000, 250 * 2 ** connection.reconnectAttempt);
	connection.reconnectAttempt += 1;
	connection.reconnectTimer = window.setTimeout(() => {
		connection.reconnectTimer = null;
		openConnection(connection);
	}, delay);
}

function openConnection(connection: WorkspaceEventConnection): void {
	closeSocket(connection);
	if (connection.closed || connection.listeners.size === 0) {
		return;
	}
	const socket = new WebSocket(runtimeStreamUrl(connection.workspaceId));
	connection.socket = socket;
	socket.addEventListener("open", () => {
		connection.reconnectAttempt = 0;
	});
	socket.addEventListener("message", (message) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(String(message.data));
		} catch {
			return;
		}
		if (!isVcsProjectEventMessage(parsed) || parsed.workspaceId !== connection.workspaceId) {
			const fallbackEvent = workspaceMetadataEvent(parsed, connection.workspaceId);
			if (!fallbackEvent) {
				return;
			}
			for (const listener of connection.listeners) {
				listener(fallbackEvent);
			}
			return;
		}
		for (const listener of connection.listeners) {
			listener(parsed);
		}
	});
	socket.addEventListener("close", () => {
		if (connection.socket === socket) {
			connection.socket = null;
			scheduleReconnect(connection);
		}
	});
	socket.addEventListener("error", () => {
		socket.close();
	});
}

export function subscribeToVcsProjectEvents(
	workspaceId: string,
	listener: VcsProjectEventListener,
): () => void {
	let connection = connections.get(workspaceId);
	if (!connection) {
		connection = {
			workspaceId,
			listeners: new Set(),
			socket: null,
			reconnectTimer: null,
			reconnectAttempt: 0,
			closed: false,
		};
		connections.set(workspaceId, connection);
	}
	connection.listeners.add(listener);
	if (!connection.socket && connection.reconnectTimer === null) {
		openConnection(connection);
	}
	return () => {
		const current = connections.get(workspaceId);
		if (!current) {
			return;
		}
		current.listeners.delete(listener);
		if (current.listeners.size === 0) {
			current.closed = true;
			closeSocket(current);
			connections.delete(workspaceId);
		}
	};
}
