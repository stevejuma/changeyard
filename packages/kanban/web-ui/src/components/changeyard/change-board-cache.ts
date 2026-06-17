import type {
	RuntimeChangeyardBoardFilesResponse,
	RuntimeChangeyardBoardFilesScope,
	RuntimeChangeyardBoardSummaryResponse,
	RuntimeChangeyardChangeListItem,
} from "@/runtime/types";

export const CHANGE_BOARD_SUMMARY_CACHE_LIMIT = 25;
export const CHANGE_BOARD_FILES_CACHE_LIMIT = 75;

export class BoundedLruCache<TKey, TValue> {
	private readonly entries = new Map<TKey, TValue>();

	constructor(readonly limit: number) {}

	get(key: TKey): TValue | undefined {
		if (!this.entries.has(key)) {
			return undefined;
		}
		const value = this.entries.get(key);
		this.entries.delete(key);
		this.entries.set(key, value as TValue);
		return value;
	}

	set(key: TKey, value: TValue): void {
		if (this.entries.has(key)) {
			this.entries.delete(key);
		}
		this.entries.set(key, value);
		while (this.entries.size > this.limit) {
			const oldestKey = this.entries.keys().next().value as TKey | undefined;
			if (oldestKey === undefined) {
				break;
			}
			this.entries.delete(oldestKey);
		}
	}

	has(key: TKey): boolean {
		return this.entries.has(key);
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}

const summaryCache = new BoundedLruCache<string, RuntimeChangeyardBoardSummaryResponse>(
	CHANGE_BOARD_SUMMARY_CACHE_LIMIT,
);
const filesCache = new BoundedLruCache<string, RuntimeChangeyardBoardFilesResponse>(
	CHANGE_BOARD_FILES_CACHE_LIMIT,
);

export function getChangeBoardSummaryCacheKey(
	workspaceId: string | null,
	change: RuntimeChangeyardChangeListItem,
	workspaceEventVersion = 0,
): string {
	return [
		workspaceId ?? "__unscoped__",
		change.id,
		change.updatedAt ?? "unversioned",
		change.base?.revision ?? "no-base",
		change.workspace?.path ?? "no-workspace",
		`workspace-event:${workspaceEventVersion}`,
	].join("\x1f");
}

export function getChangeBoardFilesCacheKey(
	summaryKey: string,
	version: string,
	scope: RuntimeChangeyardBoardFilesScope,
): string {
	const scopeKey = scope === "all" ? "all" : `commit:${scope.commitHash}`;
	return [summaryKey, version, scopeKey].join("\x1f");
}

export function readCachedChangeBoardSummary(key: string): RuntimeChangeyardBoardSummaryResponse | undefined {
	return summaryCache.get(key);
}

export function writeCachedChangeBoardSummary(key: string, value: RuntimeChangeyardBoardSummaryResponse): void {
	summaryCache.set(key, value);
}

export function readCachedChangeBoardFiles(key: string): RuntimeChangeyardBoardFilesResponse | undefined {
	return filesCache.get(key);
}

export function writeCachedChangeBoardFiles(key: string, value: RuntimeChangeyardBoardFilesResponse): void {
	filesCache.set(key, value);
}

export function clearChangeBoardCaches(): void {
	summaryCache.clear();
	filesCache.clear();
}
