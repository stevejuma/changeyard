export function normalizeVcsCommandArgs(command: string, args: readonly string[]): string[] {
	if (command !== "jj") {
		return [...args];
	}
	return ["--color=never", ...stripColorArgs(args)];
}

export function vcsNoColorEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return {
		...env,
		NO_COLOR: "1",
		CLICOLOR: "0",
		CLICOLOR_FORCE: "0",
		GIT_OPTIONAL_LOCKS: "0",
		FORCE_COLOR: "0",
	};
}

function stripColorArgs(args: readonly string[]): string[] {
	const next: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--color") {
			index++;
			continue;
		}
		if (arg?.startsWith("--color=")) {
			continue;
		}
		next.push(arg);
	}
	return next;
}
