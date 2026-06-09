export interface SendTerminalInputOptions {
	appendNewline?: boolean;
	mode?: "type" | "paste";
	preferTerminal?: boolean;
}

export type SendTaskSessionInputFn = (
	taskId: string,
	text: string,
	options?: SendTerminalInputOptions,
) => Promise<{ ok: boolean; message?: string }>;

const FOCUS_IN = "\x1b[I";
const FOCUS_DELAY_MS = 300;

export async function sendTuiInputWithSubmit(
	sendInput: SendTaskSessionInputFn,
	taskId: string,
	text: string,
): Promise<{ ok: boolean; message?: string }> {
	const typed = await sendInput(taskId, FOCUS_IN + text, { appendNewline: false, preferTerminal: false });
	if (!typed.ok) {
		return typed;
	}
	await new Promise<void>((resolve) => {
		setTimeout(resolve, FOCUS_DELAY_MS);
	});
	return await sendInput(taskId, "\r", { appendNewline: false, preferTerminal: false });
}
