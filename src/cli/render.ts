import type { DoctorReport } from "../commands/doctor.js";
import type { NextAction } from "../commands/next.js";
import type { WorkspaceStatus } from "../commands/workspace.js";
import { formatWorkflowAuditReport, type WorkflowAuditReport } from "../commands/audit.js";
import type { ChangeSummary } from "../types.js";
import type { CliColors } from "./color.js";
import { pushWrapped, terminalWrapWidth, wrapRenderedText } from "./text.js";

export type RenderContext = {
  command: string;
  positional: string[];
  colors: CliColors;
};

function pushSection(lines: string[], title: string, items: string[], width: number): void {
  if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  lines.push(`${title}:`);
  if (items.length === 0) {
    lines.push("  - No blocking problems found");
    return;
  }
  for (const item of items) pushWrapped(lines, "  - ", item, width);
}

function statusColor(colors: CliColors, status: string): string {
  if (["merged", "approved", "ready_for_pr", "passed", "pass", "synced"].includes(status)) return colors.green(status);
  if (["blocked", "changes_requested", "failed", "fail", "abandoned"].includes(status)) return colors.red(status);
  if (["in_progress", "in_review", "pr_open"].includes(status)) return colors.cyan(status);
  if (["ready", "draft", "pending", "warning"].includes(status)) return colors.yellow(status);
  if (status === "skipped") return colors.dim(status);
  return status;
}

function renderDoctor(report: DoctorReport, colors: CliColors): string {
  const width = terminalWrapWidth();
  if (!colors.enabled) {
    const lines: string[] = [];
    pushSection(lines, "Doctor ok", report.ok, width);
    if (report.warnings.length > 0) pushSection(lines, "Warnings", report.warnings, width);
    if (report.fixes.length > 0) pushSection(lines, "Fixes", report.fixes, width);
    if (report.notes.length > 0) pushSection(lines, "Notes", report.notes, width);
    return lines.join("\n");
  }
  const lines = [`${colors.green("✓")} ${colors.bold("Doctor ok")}`];
  const okItems = report.ok.length > 0 ? report.ok : ["No blocking problems found"];
  for (const ok of okItems) pushWrapped(lines, "  - ", ok, width);
  if (report.warnings.length > 0) lines.push("");
  for (const warning of report.warnings) pushWrapped(lines, `${colors.yellow("!")} ${colors.yellow("Warning")} `, warning, width);
  if (report.fixes.length > 0) lines.push("");
  for (const fix of report.fixes) pushWrapped(lines, `${colors.green("✓")} ${colors.green("Fix")} `, fix, width);
  if (report.notes.length > 0) lines.push("");
  for (const note of report.notes) pushWrapped(lines, `${colors.blue("i")} ${colors.blue("Note")} `, note, width);
  return lines.join("\n");
}

function renderChangeSummary(status: ChangeSummary, colors: CliColors): string {
  if (!colors.enabled) {
    const lines = [`id: ${status.id}`, `title: ${status.title}`, `type: ${status.type}`, `status: ${status.status}`, `path: ${status.path}`];
    if (status.planning) lines.push(`planning: ${status.planning.model} ${status.planning.strictness}`);
    return lines.join("\n");
  }
  const lines = [`${colors.bold(status.id)} ${statusColor(colors, status.status)} ${status.title}`, `  type: ${status.type}`, `  path: ${colors.dim(status.path)}`];
  if (status.planning) {
    lines.push(`  planning: ${status.planning.model} ${status.planning.strictness} (${statusColor(colors, status.planning.phase)})`);
    if (status.planning.nextAction) lines.push(`  next planning action: ${colors.yellow(status.planning.nextAction)}`);
    if (status.planning.errors.length > 0) lines.push(`  planning errors: ${colors.red(status.planning.errors.join("; "))}`);
  }
  return lines.join("\n");
}

function renderPlanStatus(status: ChangeSummary, colors: CliColors): string {
  if (!status.planning) {
    return colors.enabled
      ? `${colors.bold(status.id)} ${statusColor(colors, status.status)} ${status.title}\n  planning: ${colors.yellow("none")}`
      : [`id: ${status.id}`, `title: ${status.title}`, "planning: none"].join("\n");
  }
  if (!colors.enabled) return renderChangeSummary(status, colors);
  const lines = [
    `${colors.bold(status.id)} ${statusColor(colors, status.status)} ${status.title}`,
    `  planning: ${status.planning.model} ${status.planning.strictness} (${statusColor(colors, status.planning.phase)})`,
    `  gates: pass=${colors.green(String(status.planning.gateSummary.pass))} pending=${colors.yellow(String(status.planning.gateSummary.pending))} fail=${colors.red(String(status.planning.gateSummary.fail))} skipped=${colors.dim(String(status.planning.gateSummary.skipped))} warning=${colors.yellow(String(status.planning.gateSummary.warning))}`,
  ];
  for (const [gate, value] of Object.entries(status.planning.gates)) {
    lines.push(`    ${gate}: ${statusColor(colors, value)}`);
  }
  if (status.planning.missingSections.length > 0) lines.push(`  missing sections: ${colors.yellow(status.planning.missingSections.join(", "))}`);
  if (status.planning.errors.length > 0) lines.push(`  planning errors: ${colors.red(status.planning.errors.join("; "))}`);
  if (status.planning.nextAction) lines.push(`  next planning action: ${colors.yellow(status.planning.nextAction)}`);
  lines.push(`  path: ${colors.dim(status.path)}`);
  return lines.join("\n");
}

function renderNext(action: NextAction, colors: CliColors): string {
  if (!colors.enabled) {
    return [
      `id: ${action.id}`,
      `title: ${action.title}`,
      `status: ${action.status}`,
      `workflowMode: ${action.workflowMode}`,
      `expectedCwd: ${action.expectedCwd}`,
      `nextKind: ${action.nextKind}`,
      `Next: ${action.nextCommand}`,
      ...(action.landingConfirmation ? [
        `landingConfirmationRequired: ${String(action.landingConfirmation.required)}`,
        `landingConfirmation: ${action.landingConfirmation.reason}`,
      ] : []),
      ...(action.blockers.length ? [`blockers: ${action.blockers.join("; ")}`] : []),
    ].join("\n");
  }
  const lines = [
    `${colors.bold(action.id)} ${statusColor(colors, action.status)} ${action.title}`,
    `  workflow: ${action.workflowMode}`,
    `  expected cwd: ${colors.dim(action.expectedCwd)}`,
    `  next: ${colors.green(action.nextCommand)}`,
  ];
  if (action.landingConfirmation) {
    const status = action.landingConfirmation.required ? colors.yellow("required") : colors.green("not required");
    lines.push(`  landing confirmation: ${status}; ${action.landingConfirmation.reason}`);
  }
  if (action.planningNextAction) lines.push(`  planning: ${colors.yellow(action.planningNextAction)}`);
  if (action.workspace) lines.push(`  workspace: ${action.workspace.path ?? "missing"} ${action.workspace.dirty ? colors.yellow("dirty") : colors.green("clean")}`);
  for (const blocker of action.blockers) lines.push(`  ${colors.red("blocker:")} ${blocker}`);
  return lines.join("\n");
}

function renderWorkspace(status: WorkspaceStatus, colors: CliColors): string {
  if (!colors.enabled) {
    return [
      `id: ${status.id}`,
      `status: ${status.status}`,
      `workspacePath: ${status.path ?? "missing"}`,
      `engine: ${status.engine ?? "unknown"}`,
      `dirty: ${String(status.dirty)}`,
      `conflicts: ${String(status.conflicts)}`,
      `landable: ${String(status.landable)}`,
      ...(status.landBlockers.length ? [`landBlockers: ${status.landBlockers.join("; ")}`] : []),
      ...(status.nextCommand ? [`Next: ${status.nextCommand}`] : []),
    ].join("\n");
  }
  const lines = [
    `${colors.bold(status.id)} ${statusColor(colors, status.status)} ${status.engine ?? "unknown"}`,
    `  path: ${status.path ?? "missing"}`,
    `  state: ${status.dirty ? colors.yellow("dirty") : colors.green("clean")}${status.conflicts ? ` ${colors.red("conflicts")}` : ""}`,
    `  landable: ${status.landable ? colors.green("true") : colors.yellow("false")}`,
  ];
  for (const blocker of status.landBlockers) lines.push(`  ${colors.red("blocker:")} ${blocker}`);
  if (status.nextCommand) lines.push(`  next: ${colors.green(status.nextCommand)}`);
  return lines.join("\n");
}

function renderTable(rows: string[][], colors: CliColors): string {
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index]?.replace(/\u001b\[[0-9;]*m/g, "").length ?? 0)));
  return rows.map((row, rowIndex) => row.map((cell, index) => {
    const value = rowIndex === 0 ? colors.bold(cell) : cell;
    return value + " ".repeat(Math.max(0, widths[index] - value.replace(/\u001b\[[0-9;]*m/g, "").length));
  }).join("  ").trimEnd()).join("\n");
}

function renderTabTable(output: string, headers: string[], colors: CliColors): string {
  if (!colors.enabled || !output.includes("\t")) return output;
  const rows = output.split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
  return renderTable([headers, ...rows], colors);
}

function renderSuccessString(output: string, colors: CliColors): string {
  let rendered = output;
  if (colors.enabled && /^(Created|Updated|Synced|Started|Verified|Completed|Landed|Deleted|Installed|Uninstalled|Valid change)/.test(output)) {
    rendered = output.split(/\r?\n/).map((line, index) => {
      if (index === 0) return `${colors.green("✓")} ${line}`;
      if (line.startsWith("Next:")) return `${colors.green("→")} ${colors.green(line)}`;
      return line;
    }).join("\n");
    return wrapRenderedText(rendered);
  }
  if (colors.enabled && output.startsWith("Dry-run:")) rendered = colors.yellow(output);
  return wrapRenderedText(rendered);
}

export function renderHumanOutput(context: RenderContext, output: unknown): string {
  if (output === undefined || output === null) return "";
  if (context.command === "doctor" && typeof output === "object") return renderDoctor(output as DoctorReport, context.colors);
  if (context.command === "plan" && context.positional[0] === "status" && typeof output === "object") return renderPlanStatus(output as ChangeSummary, context.colors);
  if (context.command === "status" && typeof output === "object") return renderChangeSummary(output as ChangeSummary, context.colors);
  if (context.command === "next" && typeof output === "object") return renderNext(output as NextAction, context.colors);
  if (context.command === "audit" && typeof output === "object") return formatWorkflowAuditReport(output as WorkflowAuditReport);
  if (context.command === "workspace" && context.positional[0] === "status" && typeof output === "object") return renderWorkspace(output as WorkspaceStatus, context.colors);
  if (context.command === "workspace" && context.positional[0] === "list" && typeof output === "string") return renderTabTable(output, ["id", "status", "engine", "state", "path"], context.colors);
  if (context.command === "list" && typeof output === "string") {
    const headers = output.split(/\r?\n/)[0]?.split("\t").length === 5 ? ["id", "status", "type", "planning", "title"] : ["id", "status", "type", "title"];
    return renderTabTable(output, headers, context.colors);
  }
  if (typeof output === "string") return renderSuccessString(output, context.colors);
  return JSON.stringify(output);
}
