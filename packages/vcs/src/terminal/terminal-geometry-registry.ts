export interface TerminalGeometry {
	cols: number;
	rows: number;
}

const geometryByTaskId = new Map<string, TerminalGeometry>();

export function reportTerminalGeometry(taskId: string, geometry: TerminalGeometry): void {
	const previous = geometryByTaskId.get(taskId);
	if (previous && previous.cols === geometry.cols && previous.rows === geometry.rows) {
		return;
	}
	geometryByTaskId.set(taskId, geometry);
}

export function clearTerminalGeometry(taskId: string): void {
	geometryByTaskId.delete(taskId);
}
