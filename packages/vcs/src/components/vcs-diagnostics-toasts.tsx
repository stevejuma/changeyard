import { useEffect, useMemo } from "react";

import { showAppToast } from "@/components/app-toaster";
import type { VcsDiagnostic } from "@/runtime/types";

const MUTED_DIAGNOSTIC_CODES_KEY = "changeyard.vcs.mutedDiagnosticCodes";
const SILENCEABLE_DIAGNOSTIC_CODES = new Set(["provider_unknown"]);

function readMutedDiagnosticCodes(): Set<string> {
	if (typeof window === "undefined") {
		return new Set();
	}
	try {
		const raw = window.localStorage.getItem(MUTED_DIAGNOSTIC_CODES_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
	} catch {
		return new Set();
	}
}

function muteDiagnosticCode(code: string): void {
	if (typeof window === "undefined") {
		return;
	}
	const mutedCodes = readMutedDiagnosticCodes();
	mutedCodes.add(code);
	window.localStorage.setItem(MUTED_DIAGNOSTIC_CODES_KEY, JSON.stringify([...mutedCodes].sort()));
}

function diagnosticIntent(level: VcsDiagnostic["level"]): "danger" | "warning" | "none" {
	if (level === "error") {
		return "danger";
	}
	if (level === "warning") {
		return "warning";
	}
	return "none";
}

function diagnosticTimeout(level: VcsDiagnostic["level"]): number {
	if (level === "error") {
		return 9000;
	}
	if (level === "warning") {
		return 7000;
	}
	return 5000;
}

function uniqueDiagnostics(diagnostics: VcsDiagnostic[]): VcsDiagnostic[] {
	const seen = new Set<string>();
	const result: VcsDiagnostic[] = [];
	for (const diagnostic of diagnostics) {
		const key = `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(diagnostic);
	}
	return result;
}

export function useVcsDiagnosticsToasts(diagnostics: VcsDiagnostic[], source: string): void {
	const stableDiagnostics = useMemo(() => uniqueDiagnostics(diagnostics), [diagnostics]);
	const diagnosticsKey = stableDiagnostics
		.map((diagnostic) => `${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`)
		.join("\n");

	useEffect(() => {
		if (stableDiagnostics.length === 0) {
			return;
		}
		const mutedCodes = readMutedDiagnosticCodes();
		for (const diagnostic of stableDiagnostics) {
			if (mutedCodes.has(diagnostic.code)) {
				continue;
			}
			const canSilence = SILENCEABLE_DIAGNOSTIC_CODES.has(diagnostic.code);
			showAppToast(
				{
					action: canSilence
						? {
								label: "Silence",
								onClick: () => muteDiagnosticCode(diagnostic.code),
							}
						: undefined,
					intent: diagnosticIntent(diagnostic.level),
					message: `${diagnostic.level} · ${diagnostic.code}\n${diagnostic.message}`,
					timeout: diagnosticTimeout(diagnostic.level),
				},
				`vcs-diagnostic:${source}:${diagnostic.level}:${diagnostic.code}:${diagnostic.message}`,
			);
		}
	}, [diagnosticsKey, source]);
}
