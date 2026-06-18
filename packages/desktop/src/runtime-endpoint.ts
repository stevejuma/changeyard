export const DEFAULT_KANBAN_RUNTIME_HOST = "127.0.0.1";

const KANBAN_RUNTIME_PORT_ENV = "KANBAN_RUNTIME_PORT";

function parseRuntimePort(rawPort: string | undefined): number {
	if (!rawPort) {
		return 3484;
	}
	const parsed = Number.parseInt(rawPort, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
		throw new Error(
			`Invalid KANBAN_RUNTIME_PORT value "${rawPort}". Expected an integer from 1-65535.`,
		);
	}
	return parsed;
}

export const DEFAULT_KANBAN_RUNTIME_PORT = parseRuntimePort(
	process.env[KANBAN_RUNTIME_PORT_ENV]?.trim(),
);
