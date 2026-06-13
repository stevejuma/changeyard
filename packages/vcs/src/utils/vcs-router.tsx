import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type MouseEvent,
	type ReactNode,
} from "react";

export type VcsLocation = {
	pathname: string;
	search: string;
	hash: string;
};

export type VcsNavigateOptions = {
	replace?: boolean;
};

type VcsRouterContextValue = {
	location: VcsLocation;
	navigate: (to: string, options?: VcsNavigateOptions) => void;
	setQueryParam: (name: string, value: string | null, options?: VcsNavigateOptions) => void;
};

const FALLBACK_ORIGIN = "http://changeyard.local";

const VcsRouterContext = createContext<VcsRouterContextValue | null>(null);

export function formatVcsLocation(location: VcsLocation): string {
	return `${location.pathname}${location.search}${location.hash}`;
}

export function readVcsQueryParam(search: string, name: string): string | null {
	return new URLSearchParams(search).get(name)?.trim() || null;
}

export function resolveVcsLocation(to: string, current: VcsLocation, origin = FALLBACK_ORIGIN): VcsLocation {
	const base = `${origin}${formatVcsLocation(current)}`;
	const resolved = new URL(to, base);
	return {
		pathname: resolved.pathname,
		search: resolved.search,
		hash: resolved.hash,
	};
}

export function setVcsLocationQueryParam(location: VcsLocation, name: string, value: string | null): VcsLocation {
	const params = new URLSearchParams(location.search);
	if (value) {
		params.set(name, value);
	} else {
		params.delete(name);
	}
	const nextSearch = params.toString();
	return {
		...location,
		search: nextSearch ? `?${nextSearch}` : "",
	};
}

export function shouldHandleVcsLinkClick(event: MouseEvent<HTMLAnchorElement>): boolean {
	if (event.defaultPrevented || event.button !== 0) {
		return false;
	}
	if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
		return false;
	}
	const target = event.currentTarget.getAttribute("target");
	if (target && target !== "_self") {
		return false;
	}
	if (event.currentTarget.hasAttribute("download")) {
		return false;
	}
	const href = event.currentTarget.href;
	if (!href) {
		return false;
	}
	return new URL(href).origin === window.location.origin;
}

function readBrowserLocation(): VcsLocation {
	return {
		pathname: window.location.pathname,
		search: window.location.search,
		hash: window.location.hash,
	};
}

export function VcsRouterProvider({ children }: { children: ReactNode }): React.ReactElement {
	const [location, setLocation] = useState<VcsLocation>(() => readBrowserLocation());

	useEffect(() => {
		function handlePopState(): void {
			setLocation(readBrowserLocation());
		}
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	const navigate = useCallback((to: string, options: VcsNavigateOptions = {}) => {
		const nextLocation = resolveVcsLocation(to, readBrowserLocation(), window.location.origin);
		const nextPath = formatVcsLocation(nextLocation);
		const currentPath = formatVcsLocation(readBrowserLocation());
		if (nextPath !== currentPath) {
			if (options.replace) {
				window.history.replaceState(null, "", nextPath);
			} else {
				window.history.pushState(null, "", nextPath);
			}
		}
		setLocation(nextLocation);
	}, []);

	const setQueryParam = useCallback(
		(name: string, value: string | null, options: VcsNavigateOptions = { replace: true }) => {
			const nextLocation = setVcsLocationQueryParam(readBrowserLocation(), name, value);
			navigate(formatVcsLocation(nextLocation), { replace: options.replace ?? true });
		},
		[navigate],
	);

	const value = useMemo(
		() => ({
			location,
			navigate,
			setQueryParam,
		}),
		[location, navigate, setQueryParam],
	);

	return <VcsRouterContext.Provider value={value}>{children}</VcsRouterContext.Provider>;
}

export function useVcsRouter(): VcsRouterContextValue {
	const context = useContext(VcsRouterContext);
	if (!context) {
		throw new Error("useVcsRouter must be used inside VcsRouterProvider.");
	}
	return context;
}
