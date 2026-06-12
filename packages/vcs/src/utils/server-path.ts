export function normalizeServerPath(pathValue: string): string {
	return pathValue.replaceAll("\\", "/");
}

export function splitServerPath(pathValue: string): string[] {
	return normalizeServerPath(pathValue).split("/").filter(Boolean);
}

export function toServerAbsolute(rootPath: string, uiPath: string): string {
	const root = normalizeServerPath(rootPath).replace(/\/+$/, "");
	const parts = normalizeServerPath(uiPath).split("/").filter(Boolean);
	return [root, ...parts].join("/");
}

export function toUiRelative(rootPath: string, absolutePath: string): string {
	const normalizedRoot = normalizeServerPath(rootPath).replace(/\/+$/, "");
	const normalizedAbsolute = normalizeServerPath(absolutePath);
	if (normalizedAbsolute === normalizedRoot) {
		return "";
	}
	const afterRoot = normalizedAbsolute.slice(normalizedRoot.length);
	return afterRoot.replace(/^\/+/, "");
}

export function serverRootLabel(rootPath: string): string {
	const normalized = normalizeServerPath(rootPath);
	const winDriveMatch = normalized.match(/^[A-Za-z]:\/?/);
	if (winDriveMatch) {
		const drive = winDriveMatch[0];
		return drive.endsWith("/") ? drive : `${drive}/`;
	}
	return "/";
}
