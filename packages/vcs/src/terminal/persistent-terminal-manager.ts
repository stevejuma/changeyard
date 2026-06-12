import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";

import type {
	RuntimeTaskSessionSummary,
	RuntimeTerminalWsClientMessage,
	RuntimeTerminalWsServerMessage,
} from "@/runtime/types";
import { postTrpcMutation } from "@/runtime/trpc-client";
import { clearTerminalGeometry, reportTerminalGeometry } from "@/terminal/terminal-geometry-registry";
import { createVcsTerminalOptions } from "@/terminal/terminal-options";
import { estimateTaskSessionGeometry } from "@/terminal/task-session-geometry";
import { isMacPlatform } from "@/utils/platform";
import { getTerminalThemeColors, type ThemeTerminalColors } from "@/utils/vcs-theme";

const SHIFT_ENTER_SEQUENCE = "\n";
const RESIZE_DEBOUNCE_MS = 50;
const PARKING_ROOT_ID = "vcs-persistent-terminal-parking-root";

type PersistentTerminalAppearance = {
	cursorColor: string;
	terminalBackgroundColor: string;
	themeColors?: ThemeTerminalColors;
};

type PersistentTerminalSubscriber = {
	onLastError?: (message: string | null) => void;
	onSummary?: (summary: RuntimeTaskSessionSummary) => void;
};

type MountPersistentTerminalOptions = {
	autoFocus?: boolean;
	isVisible?: boolean;
};

type EnsurePersistentTerminalInput = PersistentTerminalAppearance & {
	taskId: string;
	workspaceId: string;
};

function generateTerminalClientId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `terminal-${Math.random().toString(36).slice(2, 10)}`;
}

function getTerminalWebSocketUrl(path: "/api/terminal/io" | "/api/terminal/control", taskId: string, workspaceId: string, clientId: string): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${protocol}//${window.location.host}${path}`);
	url.searchParams.set("taskId", taskId);
	url.searchParams.set("workspaceId", workspaceId);
	url.searchParams.set("clientId", clientId);
	return url.toString();
}

function decodeTerminalSocketChunk(decoder: TextDecoder, data: string | ArrayBuffer | Blob): string {
	if (typeof data === "string") {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return decoder.decode(new Uint8Array(data), { stream: true });
	}
	return "";
}

function getTerminalSocketWriteData(data: string | ArrayBuffer | Blob): string | Uint8Array | null {
	if (typeof data === "string") {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	return null;
}

function getTerminalSocketChunkByteLength(data: string | ArrayBuffer | Blob): number {
	if (typeof data === "string") {
		return new TextEncoder().encode(data).byteLength;
	}
	if (data instanceof ArrayBuffer) {
		return data.byteLength;
	}
	return 0;
}

function isCopyShortcut(event: KeyboardEvent): boolean {
	return (
		event.type === "keydown" &&
		((isMacPlatform && event.metaKey && !event.shiftKey && event.key.toLowerCase() === "c") ||
			(!isMacPlatform && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c"))
	);
}

function getParkingRoot(): HTMLDivElement {
	const existingRoot = document.getElementById(PARKING_ROOT_ID);
	if (existingRoot instanceof HTMLDivElement) {
		return existingRoot;
	}
	const root = document.createElement("div");
	root.id = PARKING_ROOT_ID;
	root.setAttribute("aria-hidden", "true");
	Object.assign(root.style, {
		position: "fixed",
		left: "-10000px",
		top: "-10000px",
		width: "1px",
		height: "1px",
		overflow: "hidden",
		opacity: "0",
		pointerEvents: "none",
	});
	document.body.appendChild(root);
	return root;
}

function buildKey(workspaceId: string, taskId: string): string {
	return `${workspaceId}:${taskId}`;
}

class PersistentTerminal {
	private readonly terminal: Terminal;
	private readonly fitAddon = new FitAddon();
	private readonly unicode11Addon = new Unicode11Addon();
	private readonly hostElement: HTMLDivElement;
	private readonly parkingRoot: HTMLDivElement;
	private readonly subscribers = new Set<PersistentTerminalSubscriber>();
	private readonly clientId = generateTerminalClientId();
	private appearance: PersistentTerminalAppearance;
	private latestSummary: RuntimeTaskSessionSummary | null = null;
	private lastError: string | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeTimer: ReturnType<typeof setTimeout> | null = null;
	private visibleContainer: HTMLDivElement | null = null;
	private ioSocket: WebSocket | null = null;
	private controlSocket: WebSocket | null = null;
	private outputTextDecoder = new TextDecoder();
	private terminalWriteQueue: Promise<void> = Promise.resolve();
	private disposed = false;

	constructor(
		private readonly taskId: string,
		private readonly workspaceId: string,
		appearance: PersistentTerminalAppearance,
	) {
		this.appearance = appearance;
		this.parkingRoot = getParkingRoot();
		this.hostElement = document.createElement("div");
		Object.assign(this.hostElement.style, {
			width: "100%",
			height: "100%",
		});
		this.parkingRoot.appendChild(this.hostElement);
		const initialGeometry = estimateTaskSessionGeometry(window.innerWidth, window.innerHeight);
		this.terminal = new Terminal({
			...createVcsTerminalOptions({
				cursorColor: this.appearance.cursorColor,
				isMacPlatform,
				terminalBackgroundColor: this.appearance.terminalBackgroundColor,
				themeColors: this.appearance.themeColors ?? getTerminalThemeColors(),
			}),
			cols: initialGeometry.cols,
			rows: initialGeometry.rows,
		});
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.loadAddon(new ClipboardAddon());
		this.terminal.loadAddon(new WebLinksAddon());
		this.terminal.loadAddon(this.unicode11Addon);
		this.terminal.unicode.activeVersion = "11";
		this.terminal.open(this.hostElement);
		this.terminal.onData((data) => this.sendIoData(data));
		this.terminal.onBinary((data) => {
			const bytes = new Uint8Array(data.length);
			for (let index = 0; index < data.length; index += 1) {
				bytes[index] = data.charCodeAt(index) & 0xff;
			}
			this.sendIoData(bytes);
		});
		this.terminal.attachCustomKeyEventHandler((event) => {
			if (event.key === "Enter" && event.shiftKey) {
				if (event.type === "keydown") {
					this.terminal.input(SHIFT_ENTER_SEQUENCE);
				}
				return false;
			}
			if (isCopyShortcut(event) && this.terminal.hasSelection()) {
				void navigator.clipboard.writeText(this.terminal.getSelection()).catch(() => undefined);
				return false;
			}
			return true;
		});
		try {
			const webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => webglAddon.dispose());
			this.terminal.loadAddon(webglAddon);
		} catch {
			// Fall back to xterm's default renderer.
		}
		this.ensureConnected();
	}

	private notifyLastError(): void {
		for (const subscriber of this.subscribers) {
			subscriber.onLastError?.(this.lastError);
		}
	}

	private notifySummary(summary: RuntimeTaskSessionSummary): void {
		this.latestSummary = summary;
		for (const subscriber of this.subscribers) {
			subscriber.onSummary?.(summary);
		}
	}

	private sendControlMessage(message: RuntimeTerminalWsClientMessage): void {
		if (!this.controlSocket || this.controlSocket.readyState !== WebSocket.OPEN) {
			return;
		}
		this.controlSocket.send(JSON.stringify(message));
	}

	private sendIoData(data: string | Uint8Array): boolean {
		if (!this.ioSocket || this.ioSocket.readyState !== WebSocket.OPEN) {
			return false;
		}
		this.ioSocket.send(data);
		return true;
	}

	private enqueueTerminalWrite(data: string | Uint8Array, ackBytes = 0): Promise<void> {
		this.terminalWriteQueue = this.terminalWriteQueue
			.catch(() => undefined)
			.then(
				() =>
					new Promise<void>((resolve) => {
						if (this.disposed) {
							resolve();
							return;
						}
						this.terminal.write(data, () => {
							if (ackBytes > 0) {
								this.sendControlMessage({ type: "output_ack", bytes: ackBytes });
							}
							resolve();
						});
					}),
			);
		return this.terminalWriteQueue;
	}

	private async applyRestore(snapshot: string, cols: number | null | undefined, rows: number | null | undefined): Promise<void> {
		await this.terminalWriteQueue.catch(() => undefined);
		this.terminal.reset();
		if (cols && rows && (this.terminal.cols !== cols || this.terminal.rows !== rows)) {
			this.terminal.resize(cols, rows);
		}
		if (snapshot) {
			await this.enqueueTerminalWrite(snapshot);
		}
	}

	private requestResize(): void {
		if (!this.visibleContainer) {
			return;
		}
		this.fitAddon.fit();
		const bounds = this.visibleContainer.getBoundingClientRect();
		reportTerminalGeometry(this.taskId, {
			cols: this.terminal.cols,
			rows: this.terminal.rows,
		});
		this.sendControlMessage({
			type: "resize",
			cols: this.terminal.cols,
			rows: this.terminal.rows,
			pixelWidth: bounds.width > 0 ? Math.round(bounds.width) : undefined,
			pixelHeight: bounds.height > 0 ? Math.round(bounds.height) : undefined,
		});
	}

	private connectIo(): void {
		if (this.ioSocket) {
			return;
		}
		const ioSocket = new WebSocket(getTerminalWebSocketUrl("/api/terminal/io", this.taskId, this.workspaceId, this.clientId));
		ioSocket.binaryType = "arraybuffer";
		ioSocket.addEventListener("message", (event) => {
			if (this.disposed || this.ioSocket !== ioSocket) {
				return;
			}
			const writeData = getTerminalSocketWriteData(event.data);
			if (!writeData) {
				return;
			}
			decodeTerminalSocketChunk(this.outputTextDecoder, event.data);
			void this.enqueueTerminalWrite(writeData, getTerminalSocketChunkByteLength(event.data));
		});
		this.ioSocket = ioSocket;
		ioSocket.onopen = () => {
			if (this.disposed || this.ioSocket !== ioSocket) {
				return;
			}
			this.lastError = null;
			this.notifyLastError();
			if (this.visibleContainer) {
				this.requestResize();
			}
		};
		ioSocket.onerror = () => {
			if (this.disposed || this.ioSocket !== ioSocket) {
				return;
			}
			this.lastError = "Terminal stream failed.";
			this.notifyLastError();
		};
		ioSocket.onclose = () => {
			if (this.disposed || this.ioSocket !== ioSocket) {
				return;
			}
			this.ioSocket = null;
			this.outputTextDecoder = new TextDecoder();
			this.lastError = "Terminal stream closed. Close and reopen to reconnect.";
			this.notifyLastError();
		};
	}

	private connectControl(): void {
		if (this.controlSocket) {
			return;
		}
		const controlSocket = new WebSocket(getTerminalWebSocketUrl("/api/terminal/control", this.taskId, this.workspaceId, this.clientId));
		this.controlSocket = controlSocket;
		controlSocket.onopen = () => {
			if (this.disposed || this.controlSocket !== controlSocket) {
				return;
			}
			this.lastError = null;
			this.notifyLastError();
		};
		controlSocket.onmessage = (event) => {
			let payload: RuntimeTerminalWsServerMessage;
			try {
				payload = JSON.parse(String(event.data)) as RuntimeTerminalWsServerMessage;
			} catch {
				return;
			}
			if (payload.type === "restore") {
				void this.applyRestore(payload.snapshot, payload.cols, payload.rows)
					.then(() => {
						if (this.disposed || this.controlSocket !== controlSocket) {
							return;
						}
						this.sendControlMessage({ type: "restore_complete" });
						this.requestResize();
					})
					.catch(() => {
						this.lastError = "Terminal restore failed.";
						this.notifyLastError();
					});
				return;
			}
			if (payload.type === "state") {
				this.notifySummary(payload.summary);
				return;
			}
			if (payload.type === "exit") {
				const label = payload.code == null ? "session exited" : `session exited with code ${payload.code}`;
				void this.enqueueTerminalWrite(`\r\n[vcs] ${label}\r\n`);
				return;
			}
			if (payload.type === "error") {
				this.lastError = payload.message;
				this.notifyLastError();
				void this.enqueueTerminalWrite(`\r\n[vcs] ${payload.message}\r\n`);
			}
		};
		controlSocket.onerror = () => {
			if (this.disposed || this.controlSocket !== controlSocket) {
				return;
			}
			this.lastError = "Terminal control connection failed.";
			this.notifyLastError();
		};
		controlSocket.onclose = () => {
			if (this.disposed || this.controlSocket !== controlSocket) {
				return;
			}
			this.controlSocket = null;
			this.lastError = "Terminal control connection closed. Close and reopen to reconnect.";
			this.notifyLastError();
		};
	}

	private ensureConnected(): void {
		if (this.disposed) {
			return;
		}
		this.connectIo();
		this.connectControl();
	}

	private updateAppearance(appearance: PersistentTerminalAppearance): void {
		this.appearance = appearance;
		this.terminal.options.theme = {
			...this.terminal.options.theme,
			...createVcsTerminalOptions({
				cursorColor: appearance.cursorColor,
				isMacPlatform,
				terminalBackgroundColor: appearance.terminalBackgroundColor,
				themeColors: appearance.themeColors ?? getTerminalThemeColors(),
			}).theme,
		};
	}

	setAppearance(appearance: PersistentTerminalAppearance): void {
		this.updateAppearance(appearance);
	}

	subscribe(subscriber: PersistentTerminalSubscriber): () => void {
		this.subscribers.add(subscriber);
		subscriber.onLastError?.(this.lastError);
		if (this.latestSummary) {
			subscriber.onSummary?.(this.latestSummary);
		}
		return () => {
			this.subscribers.delete(subscriber);
		};
	}

	mount(container: HTMLDivElement, appearance: PersistentTerminalAppearance, options: MountPersistentTerminalOptions): void {
		if (this.disposed) {
			return;
		}
		this.ensureConnected();
		this.updateAppearance(appearance);
		if (this.visibleContainer !== container) {
			this.visibleContainer = container;
			container.appendChild(this.hostElement);
		}
		this.resizeObserver?.disconnect();
		this.resizeObserver = new ResizeObserver(() => {
			if (this.resizeTimer !== null) {
				clearTimeout(this.resizeTimer);
			}
			this.resizeTimer = setTimeout(() => {
				this.resizeTimer = null;
				this.requestResize();
			}, RESIZE_DEBOUNCE_MS);
		});
		this.resizeObserver.observe(container);
		if (options.isVisible !== false) {
			window.requestAnimationFrame(() => {
				this.requestResize();
				if (options.autoFocus) {
					this.terminal.focus();
				}
			});
		}
	}

	unmount(container: HTMLDivElement | null): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.resizeTimer !== null) {
			clearTimeout(this.resizeTimer);
			this.resizeTimer = null;
		}
		if (container && this.visibleContainer !== container) {
			return;
		}
		this.visibleContainer = null;
		clearTerminalGeometry(this.taskId);
		this.parkingRoot.appendChild(this.hostElement);
	}

	clear(): void {
		this.terminalWriteQueue = this.terminalWriteQueue.catch(() => undefined).then(() => {
			if (!this.disposed) {
				this.terminal.clear();
			}
		});
	}

	async stop(): Promise<void> {
		this.sendControlMessage({ type: "stop" });
		await postTrpcMutation("runtime.stopTaskSession", { taskId: this.taskId }, this.workspaceId);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.unmount(this.visibleContainer);
		this.ioSocket?.close();
		this.controlSocket?.close();
		this.ioSocket = null;
		this.controlSocket = null;
		this.subscribers.clear();
		this.terminal.dispose();
		this.hostElement.remove();
	}
}

const terminals = new Map<string, PersistentTerminal>();

export function ensurePersistentTerminal(input: EnsurePersistentTerminalInput): PersistentTerminal {
	const key = buildKey(input.workspaceId, input.taskId);
	let terminal = terminals.get(key);
	if (!terminal) {
		terminal = new PersistentTerminal(input.taskId, input.workspaceId, {
			cursorColor: input.cursorColor,
			terminalBackgroundColor: input.terminalBackgroundColor,
			themeColors: input.themeColors,
		});
		terminals.set(key, terminal);
		return terminal;
	}
	terminal.setAppearance({
		cursorColor: input.cursorColor,
		terminalBackgroundColor: input.terminalBackgroundColor,
		themeColors: input.themeColors,
	});
	return terminal;
}

export function disposePersistentTerminal(workspaceId: string, taskId: string): void {
	const key = buildKey(workspaceId, taskId);
	const terminal = terminals.get(key);
	if (!terminal) {
		return;
	}
	terminal.dispose();
	terminals.delete(key);
}
