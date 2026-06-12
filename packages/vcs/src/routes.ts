export type VcsRoute =
	| { kind: "landing" }
	| { kind: "jj-board" }
	| { kind: "jj-branches" }
	| { kind: "jj-history" }
	| { kind: "settings" };

export function resolveVcsRoute(pathname: string): VcsRoute {
	if (pathname.startsWith("/vcs/jj/branches")) {
		return { kind: "jj-branches" };
	}
	if (pathname.startsWith("/vcs/jj/history")) {
		return { kind: "jj-history" };
	}
	if (pathname.startsWith("/vcs/jj")) {
		return { kind: "jj-board" };
	}
	if (pathname.startsWith("/vcs/settings")) {
		return { kind: "settings" };
	}
	return { kind: "landing" };
}
