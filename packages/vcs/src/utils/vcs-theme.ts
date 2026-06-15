import { useCallback, useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "kanban.theme";

export type ThemeId =
	| "default"
	| "graphite"
	| "midnight"
	| "pitch"
	| "solarized-dark"
	| "light"
	| "overcast"
	| "solarized-light"
	| "latte"
	| "high-contrast-dark"
	| "high-contrast-light";

export type ThemeGroup = "dark" | "light" | "high-contrast";

export type ThemeDefinition = {
	readonly id: ThemeId;
	readonly label: string;
	readonly group: ThemeGroup;
	readonly accent: string;
	readonly accent2: string;
	readonly surface: string;
	readonly accentFg: string;
	readonly accent2Fg: string;
};

export type ThemeTerminalColors = {
	readonly textPrimary: string;
	readonly surfacePrimary: string;
	readonly surfaceRaised: string;
	readonly selectionBackground: string;
	readonly selectionForeground: string;
	readonly selectionInactiveBackground: string;
};

export const THEMES: readonly ThemeDefinition[] = [
	{
		id: "default",
		label: "Default",
		group: "dark",
		accent: "#0084FF",
		accent2: "#7C5CFF",
		surface: "#1F2428",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "graphite",
		label: "Graphite",
		group: "dark",
		accent: "#D4915C",
		accent2: "#7A8F9C",
		surface: "#1E1E1E",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "midnight",
		label: "Midnight",
		group: "dark",
		accent: "#6366F1",
		accent2: "#EC4899",
		surface: "#121214",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "pitch",
		label: "Pitch",
		group: "dark",
		accent: "#2DD4BF",
		accent2: "#6B7280",
		surface: "#000000",
		accentFg: "#000000",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "solarized-dark",
		label: "Solarized Dark",
		group: "dark",
		accent: "#268BD2",
		accent2: "#2AA198",
		surface: "#002B36",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "light",
		label: "Light",
		group: "light",
		accent: "#0969DA",
		accent2: "#6F42C1",
		surface: "#FFFFFF",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "overcast",
		label: "Overcast",
		group: "light",
		accent: "#0F766E",
		accent2: "#92400E",
		surface: "#F3F6FA",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "solarized-light",
		label: "Solarized Light",
		group: "light",
		accent: "#2A6F97",
		accent2: "#6C5A9A",
		surface: "#FDF6E3",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "latte",
		label: "Latte",
		group: "light",
		accent: "#6F5D51",
		accent2: "#5F7180",
		surface: "#FFFCF8",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "high-contrast-dark",
		label: "High Contrast Dark",
		group: "high-contrast",
		accent: "#FFFFFF",
		accent2: "#FF4081",
		surface: "#000000",
		accentFg: "#000000",
		accent2Fg: "#FFFFFF",
	},
	{
		id: "high-contrast-light",
		label: "High Contrast Light",
		group: "high-contrast",
		accent: "#0050A0",
		accent2: "#B91C1C",
		surface: "#FFFFFF",
		accentFg: "#FFFFFF",
		accent2Fg: "#FFFFFF",
	},
];

export const THEME_GROUPS: readonly { key: ThemeGroup; label: string }[] = [
	{ key: "dark", label: "Dark" },
	{ key: "light", label: "Light" },
	{ key: "high-contrast", label: "High Contrast" },
];

const TERMINAL_COLORS_BY_THEME: Record<ThemeId, ThemeTerminalColors> = {
	default: {
		textPrimary: "#E6EDF3",
		surfacePrimary: "#1F2428",
		surfaceRaised: "#24292E",
		selectionBackground: "#0084FF4D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
	graphite: {
		textPrimary: "#E0E0E0",
		surfacePrimary: "#1E1E1E",
		surfaceRaised: "#252526",
		selectionBackground: "#D4915C4D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D2D2D66",
	},
	midnight: {
		textPrimary: "#E4E4E7",
		surfacePrimary: "#121214",
		surfaceRaised: "#18181B",
		selectionBackground: "#6366F14D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#1F1F2366",
	},
	pitch: {
		textPrimary: "#E4E4E4",
		surfacePrimary: "#000000",
		surfaceRaised: "#0A0A0A",
		selectionBackground: "#2DD4BF4D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#14141466",
	},
	"solarized-dark": {
		textPrimary: "#FDF6E3",
		surfacePrimary: "#002B36",
		surfaceRaised: "#073642",
		selectionBackground: "#268BD24D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#0E3E4A66",
	},
	light: {
		textPrimary: "#E6EDF3",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#0084FF4D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
	overcast: {
		textPrimary: "#E6EDF3",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#0D948844",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
	"solarized-light": {
		textPrimary: "#E6EDF3",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#4A7C964D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
	latte: {
		textPrimary: "#E6EDF3",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#9C887844",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
	"high-contrast-dark": {
		textPrimary: "#FFFFFF",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#FFFFFF40",
		selectionForeground: "#000000",
		selectionInactiveBackground: "#33333366",
	},
	"high-contrast-light": {
		textPrimary: "#FFFFFF",
		surfacePrimary: "#000000",
		surfaceRaised: "#000000",
		selectionBackground: "#0050A04D",
		selectionForeground: "#ffffff",
		selectionInactiveBackground: "#2D333966",
	},
};

const THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));
const listeners = new Set<() => void>();
let storageSyncInstalled = false;
let currentThemeId: ThemeId = readStoredThemeId();

function getLocalStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage;
}

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

function installStorageSyncListener(): void {
	if (storageSyncInstalled || typeof window === "undefined") {
		return;
	}
	storageSyncInstalled = true;
	window.addEventListener("storage", (event) => {
		if (event.key !== null && event.key !== THEME_STORAGE_KEY) {
			return;
		}
		const nextThemeId = readStoredThemeId();
		if (nextThemeId === currentThemeId) {
			return;
		}
		currentThemeId = nextThemeId;
		applyThemeToDocument(nextThemeId);
		notify();
	});
}

function subscribe(listener: () => void): () => void {
	installStorageSyncListener();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function readSnapshot(): ThemeId {
	return currentThemeId;
}

function applyThemeChange(themeId: ThemeId): void {
	if (themeId === currentThemeId) {
		return;
	}
	currentThemeId = themeId;
	applyThemeToDocument(themeId);
	notify();
}

function isThemeId(value: string | null): value is ThemeId {
	return value !== null && THEME_IDS.has(value);
}

export function readStoredThemeId(): ThemeId {
	try {
		const stored = getLocalStorage()?.getItem(THEME_STORAGE_KEY) ?? null;
		return isThemeId(stored) ? stored : "default";
	} catch {
		return "default";
	}
}

export function applyThemeToDocument(themeId: ThemeId): void {
	if (typeof document === "undefined") {
		return;
	}
	if (themeId === "default") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", themeId);
	}
}

export function previewThemeId(themeId: ThemeId): void {
	applyThemeChange(themeId);
}

export function saveThemeId(themeId: ThemeId): void {
	try {
		getLocalStorage()?.setItem(THEME_STORAGE_KEY, themeId);
	} catch {
		// Ignore storage write failures.
	}
	applyThemeChange(themeId);
}

export function useTheme(): { themeId: ThemeId; setThemeId: (id: ThemeId) => void } {
	const themeId = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
	const setThemeId = useCallback((id: ThemeId) => {
		saveThemeId(id);
	}, []);
	return { themeId, setThemeId };
}

export function getTerminalThemeColors(themeId: ThemeId = "default"): ThemeTerminalColors {
	return TERMINAL_COLORS_BY_THEME[themeId] ?? TERMINAL_COLORS_BY_THEME.default;
}
