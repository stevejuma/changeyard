export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (!text) {
		return false;
	}

	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Fall back to the legacy copy path below.
	}

	return copyTextWithTextArea(text);
}

function copyTextWithTextArea(text: string): boolean {
	if (typeof document === "undefined") {
		return false;
	}

	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.setAttribute("readonly", "");
	textArea.style.position = "fixed";
	textArea.style.left = "-9999px";
	textArea.style.top = "0";
	document.body.appendChild(textArea);
	textArea.select();
	textArea.setSelectionRange(0, text.length);

	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		textArea.remove();
	}
}
