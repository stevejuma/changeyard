const NOTIFICATION_PROMPTED_KEY = "changeyard.vcs.notifications.permission-prompted";

export type BrowserNotificationPermission = NotificationPermission | "unsupported";

function getLocalStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage;
}

function readPromptedFlag(): boolean {
	try {
		return getLocalStorage()?.getItem(NOTIFICATION_PROMPTED_KEY) === "true";
	} catch {
		return false;
	}
}

function writePromptedFlag(value: boolean): void {
	try {
		getLocalStorage()?.setItem(NOTIFICATION_PROMPTED_KEY, String(value));
	} catch {
		// Ignore storage write failures.
	}
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
	if (typeof Notification === "undefined") {
		return "unsupported";
	}
	return Notification.permission;
}

export function hasPromptedForBrowserNotificationPermission(): boolean {
	const permission = getBrowserNotificationPermission();
	if (permission === "granted" || permission === "denied") {
		return true;
	}
	return readPromptedFlag();
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
	const permission = getBrowserNotificationPermission();
	if (permission === "unsupported") {
		return permission;
	}
	if (permission !== "default") {
		writePromptedFlag(true);
		return permission;
	}
	try {
		const nextPermission = await Notification.requestPermission();
		writePromptedFlag(true);
		return nextPermission;
	} catch {
		writePromptedFlag(true);
		return getBrowserNotificationPermission();
	}
}
