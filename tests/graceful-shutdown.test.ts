import assert from "node:assert/strict";
import test from "node:test";

import { installCliShutdownHandlers } from "../src/commands/gracefulShutdown.js";

class FakeProcess {
	private readonly listeners = new Map<string, Set<() => void>>();
	exitCode: number | null = null;

	on(signal: string, listener: () => void): void {
		const current = this.listeners.get(signal) ?? new Set<() => void>();
		current.add(listener);
		this.listeners.set(signal, current);
	}

	off(signal: string, listener: () => void): void {
		this.listeners.get(signal)?.delete(listener);
	}

	emit(signal: string): void {
		for (const listener of this.listeners.get(signal) ?? []) {
			listener();
		}
	}

	exit(code: number): never {
		this.exitCode = code;
		return undefined as never;
	}
}

test("duplicate wrapper SIGINT does not force a second shutdown exit", async () => {
	const fakeProcess = new FakeProcess();
	let resolveClose: (() => void) | null = null;
	let closeCallCount = 0;
	const previousNpmExecPath = process.env.npm_execpath;
	process.env.npm_execpath = "/usr/local/lib/node_modules/pnpm/bin/pnpm-cli.js";

	try {
		installCliShutdownHandlers({
			processRef: fakeProcess as never,
			close: () =>
				new Promise<void>((resolve) => {
					closeCallCount += 1;
					resolveClose = resolve;
				}),
			onError: () => {
				throw new Error("shutdown should not fail");
			},
		});

		fakeProcess.emit("SIGINT");
		fakeProcess.emit("SIGINT");
		assert.equal(closeCallCount, 1);
		assert.equal(fakeProcess.exitCode, null);

		assert.ok(resolveClose);
		const completeShutdown = resolveClose as () => void;
		completeShutdown();
		await Promise.resolve();
		assert.equal(fakeProcess.exitCode, 130);
	} finally {
		if (previousNpmExecPath === undefined) {
			delete process.env.npm_execpath;
		} else {
			process.env.npm_execpath = previousNpmExecPath;
		}
	}
});
