const DUPLICATE_SIGNAL_WINDOW_MS = 750;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const TRANSIENT_CLI_CACHE_PATH_MARKERS = [
	"/pnpm/dlx/",
	"/.yarn/cache/",
	"/bunx-",
] as const;
const PACKAGE_MANAGER_EXEC_PATH_ENV = String.fromCharCode(110, 112, 109, 95, 101, 120, 101, 99, 112, 97, 116, 104);

type HandledSignal = "SIGINT" | "SIGTERM" | "SIGHUP";

type ShutdownProcess = {
	argv: string[];
	env: NodeJS.ProcessEnv;
	on: (signal: HandledSignal, listener: () => void) => void;
	off: (signal: HandledSignal, listener: () => void) => void;
	exit: (code: number) => never;
};

function normalizePath(value: string): string {
	return value.replaceAll("\\", "/").toLowerCase();
}

function shouldSuppressImmediateDuplicateSignals(): boolean {
	const packageManagerExecPath = process.env[PACKAGE_MANAGER_EXEC_PATH_ENV];
	if (typeof packageManagerExecPath === "string" && packageManagerExecPath.length > 0) {
		return true;
	}
	const entrypointPath = process.argv[1];
	if (typeof entrypointPath !== "string" || entrypointPath.length === 0) {
		return false;
	}
	const normalizedPath = normalizePath(entrypointPath);
	return TRANSIENT_CLI_CACHE_PATH_MARKERS.some((marker) => normalizedPath.includes(marker));
}

function exitCodeForSignal(signal: HandledSignal | null): number {
	switch (signal) {
		case "SIGHUP":
			return 129;
		case "SIGINT":
			return 130;
		case "SIGTERM":
			return 143;
		default:
			return 0;
	}
}

export function installCliShutdownHandlers(options: {
	close: () => Promise<void>;
	onError: (signal: HandledSignal, error: unknown) => void;
	onTimeout?: (signal: HandledSignal | null) => void;
	processRef?: ShutdownProcess;
}): void {
	const processRef = (options.processRef ?? process) as ShutdownProcess;
	const suppressDuplicates = shouldSuppressImmediateDuplicateSignals();
	const handledSignals: HandledSignal[] = ["SIGINT", "SIGTERM", "SIGHUP"];
	let shutdownPromise: Promise<void> | null = null;
	let shutdownSignal: HandledSignal | null = null;
	let shutdownStartedAt = 0;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const cleanup = () => {
		for (const signal of handledSignals) {
			processRef.off(signal, listeners[signal]);
		}
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const finalize = (code: number) => {
		cleanup();
		processRef.exit(code);
	};

	const startShutdown = (signal: HandledSignal) => {
		if (shutdownPromise) {
			return;
		}
		shutdownSignal = signal;
		shutdownStartedAt = Date.now();
		timeoutId = setTimeout(() => {
			options.onTimeout?.(shutdownSignal);
			finalize(1);
		}, SHUTDOWN_TIMEOUT_MS);
		shutdownPromise = options
			.close()
			.then(() => {
				finalize(exitCodeForSignal(signal));
			})
			.catch((error) => {
				options.onError(signal, error);
				finalize(1);
			});
	};

	const handleSignal = (signal: HandledSignal) => {
		if (!shutdownPromise) {
			startShutdown(signal);
			return;
		}
		if (
			suppressDuplicates &&
			shutdownSignal === signal &&
			Date.now() - shutdownStartedAt <= DUPLICATE_SIGNAL_WINDOW_MS
		) {
			return;
		}
		finalize(exitCodeForSignal(signal));
	};

	const listeners: Record<HandledSignal, () => void> = {
		SIGINT: () => handleSignal("SIGINT"),
		SIGTERM: () => handleSignal("SIGTERM"),
		SIGHUP: () => handleSignal("SIGHUP"),
	};

	for (const signal of handledSignals) {
		processRef.on(signal, listeners[signal]);
	}
}
