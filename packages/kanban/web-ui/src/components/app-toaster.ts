import { toast } from "sonner";
import type { CSSProperties } from "react";

import { copyTextToClipboard } from "@/utils/clipboard";

interface AppToastProps {
	copyText?: string;
	intent?: "danger" | "warning" | "success" | "primary" | "info" | "none";
	icon?: string;
	message: string;
	timeout?: number;
}

interface NotifyErrorOptions {
	copyText?: string;
	key?: string;
	timeout?: number;
}

function toastStyleForIntent(intent: AppToastProps["intent"]): CSSProperties | undefined {
	if (intent === "danger") {
		return {
			background: "color-mix(in srgb, var(--color-status-red) 16%, var(--color-surface-1))",
			border: "1px solid color-mix(in srgb, var(--color-status-red) 54%, var(--color-border))",
			color: "var(--color-text-primary)",
		};
	}
	if (intent === "warning") {
		return {
			background: "color-mix(in srgb, var(--color-status-orange) 18%, var(--color-surface-1))",
			border: "1px solid color-mix(in srgb, var(--color-status-orange) 58%, var(--color-border))",
			color: "var(--color-text-primary)",
		};
	}
	if (intent === "primary" || intent === "info") {
		return {
			background: "color-mix(in srgb, var(--color-status-blue) 14%, var(--color-surface-1))",
			border: "1px solid color-mix(in srgb, var(--color-status-blue) 48%, var(--color-border))",
			color: "var(--color-text-primary)",
		};
	}
	if (intent === "success") {
		return {
			background: "color-mix(in srgb, var(--color-status-green) 14%, var(--color-surface-1))",
			border: "1px solid color-mix(in srgb, var(--color-status-green) 48%, var(--color-border))",
			color: "var(--color-text-primary)",
		};
	}
	return undefined;
}

export function showAppToast(props: AppToastProps, key?: string): void {
	const isPersistent = props.intent === "danger" || props.intent === "warning";
	const copyText = props.copyText ?? (isPersistent ? props.message : undefined);
	const copyAction = copyText
		? {
				label: "Copy details",
				onClick: () => {
					void copyTextToClipboard(copyText).then((copied) => {
						if (copied) {
							showAppToast({ intent: "success", message: "Copied details.", timeout: 1200 }, `copied:${key ?? copyText}`);
						}
					});
				},
			}
		: undefined;
	const options: Parameters<typeof toast>[1] = {
		action: copyAction,
		closeButton: isPersistent,
		id: key,
		duration: isPersistent ? Infinity : props.timeout ?? 5000,
		style: toastStyleForIntent(props.intent),
	};

	if (props.intent === "danger") {
		toast.error(props.message, options);
	} else if (props.intent === "warning") {
		toast.warning(props.message, options);
	} else if (props.intent === "success") {
		toast.success(props.message, options);
	} else if (props.intent === "primary" || props.intent === "info") {
		toast.info(props.message, options);
	} else {
		toast(props.message, options);
	}
}

export function notifyError(message: string | null | undefined, options?: NotifyErrorOptions): void {
	const normalized = message?.trim();
	if (!normalized) {
		return;
	}
	showAppToast(
		{
			copyText: options?.copyText ?? normalized,
			intent: "danger",
			icon: "warning-sign",
			message: normalized,
			timeout: options?.timeout ?? 7000,
		},
		options?.key ?? `error:${normalized}`,
	);
}
