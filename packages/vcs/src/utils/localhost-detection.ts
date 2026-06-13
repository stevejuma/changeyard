const LOCALHOST_HOSTS = ["localhost", "127.0.0.1", "::1"];

export function isLocalhostAccess(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return LOCALHOST_HOSTS.includes(window.location.hostname);
}

export function shouldUseNativeDirectoryPicker(): boolean {
	if (typeof navigator !== "undefined" && navigator.webdriver) {
		return false;
	}
	return isLocalhostAccess();
}
