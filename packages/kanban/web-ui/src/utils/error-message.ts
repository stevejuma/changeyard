function nestedValue(input: unknown, key: "data" | "error"): unknown {
	if (!input || typeof input !== "object" || !(key in input)) {
		return null;
	}
	return (input as Record<string, unknown>)[key];
}

function directMessage(input: unknown): string | null {
	if (typeof input === "string") {
		const normalized = input.trim();
		return normalized.length > 0 ? normalized : null;
	}
	if (input instanceof Error) {
		const normalized = input.message.trim();
		return normalized.length > 0 ? normalized : null;
	}
	if (!input || typeof input !== "object") {
		return null;
	}
	if ("message" in input && typeof input.message === "string") {
		const normalized = input.message.trim();
		return normalized.length > 0 ? normalized : null;
	}
	return null;
}

export function getErrorMessage(error: unknown, fallback = "Request failed."): string {
	const direct = directMessage(error);
	if (direct) {
		return direct;
	}
	const dataMessage = directMessage(nestedValue(error, "data"));
	if (dataMessage) {
		return dataMessage;
	}
	const nestedError = nestedValue(error, "error");
	const nestedErrorMessage = directMessage(nestedError);
	if (nestedErrorMessage) {
		return nestedErrorMessage;
	}
	const nestedErrorDataMessage = directMessage(nestedValue(nestedError, "data"));
	if (nestedErrorDataMessage) {
		return nestedErrorDataMessage;
	}
	return fallback;
}

export function toError(error: unknown, fallback?: string): Error {
	return error instanceof Error ? error : new Error(getErrorMessage(error, fallback));
}
