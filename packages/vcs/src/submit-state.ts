export type SubmitDialogPreview = {
	available: boolean;
	items: Array<unknown>;
};

export type SubmitDialogResult = {
	ok: boolean;
	items: Array<{
		bookmarkName: string;
		completed: boolean;
		resultPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
	}>;
};

export type SubmitDialogState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

export function canConfirmSubmit(
	preview: SubmitDialogPreview | null,
	submitState: SubmitDialogState<SubmitDialogResult>,
): boolean {
	if (!preview?.available || preview.items.length === 0) {
		return false;
	}
	return submitState.status !== "loading";
}

export function getSubmitOutcomeMessage(submitState: SubmitDialogState<SubmitDialogResult>): string | null {
	if (submitState.status === "error") {
		return submitState.message;
	}
	if (submitState.status !== "ready") {
		return null;
	}
	if (!submitState.data.ok) {
		return "Stack submit stopped.";
	}
	const completedCount = submitState.data.items.filter((item) => item.completed).length;
	return `Stack submit finished. ${completedCount}/${submitState.data.items.length} items completed.`;
}
