import type { CliColors } from "./color.js";
import { pushWrapped, terminalWrapWidth } from "./text.js";

export type GuidanceChoice = {
  value: string;
  description?: string;
};

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      const substitutionCost = left[i] === right[j] ? 0 : 1;
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function suggestionThreshold(input: string): number {
  if (input.length <= 3) return 1;
  if (input.length <= 6) return 2;
  return 3;
}

export function suggestValues<T extends GuidanceChoice>(input: string, choices: readonly T[]): T[] {
  const normalizedInput = input.toLowerCase();
  const accepted = choices
    .map((choice) => {
      const normalizedChoice = choice.value.toLowerCase();
      const distance = levenshteinDistance(normalizedInput, normalizedChoice);
      const prefix = normalizedInput.length >= 3 && normalizedChoice.startsWith(normalizedInput);
      return { choice, distance, prefix, score: prefix ? Math.min(distance, 1) : distance };
    })
    .filter((entry) => entry.prefix || entry.distance <= suggestionThreshold(normalizedInput));
  const scored = (accepted.some((choice) => choice.prefix) ? accepted.filter((choice) => choice.prefix) : accepted)
    .sort((left, right) => left.score - right.score || left.distance - right.distance || left.choice.value.localeCompare(right.choice.value));

  const suggestions: T[] = [];
  const seen = new Set<string>();
  for (const entry of scored) {
    if (seen.has(entry.choice.value)) continue;
    seen.add(entry.choice.value);
    suggestions.push(entry.choice);
  }
  return suggestions.slice(0, 3);
}

export function formatQuotedList(values: readonly string[], colors: CliColors): string {
  return values.map((value) => `'${colors.green(value)}'`).join(", ");
}

export function appendTip(lines: string[], value: string, colors: CliColors): void {
  pushWrapped(lines, `${colors.green("tip:")} `, value, terminalWrapWidth());
}

export function formatChoiceGuidance(input: {
  label: string;
  value: string;
  choices: readonly GuidanceChoice[];
  colors: CliColors;
  helpCommand?: string;
}): string {
  const lines = [`Invalid ${input.label}: ${input.colors.yellow(input.value)}`];
  const suggestions = suggestValues(input.value, input.choices);
  lines.push("");
  if (suggestions.length > 0) {
    appendTip(lines, `similar values exist: ${formatQuotedList(suggestions.map((choice) => choice.value), input.colors)}`, input.colors);
  } else {
    appendTip(lines, `use one of: ${formatQuotedList(input.choices.map((choice) => choice.value), input.colors)}`, input.colors);
  }
  lines.push("");
  lines.push(input.colors.bold("Available values:"));
  if (input.choices.some((choice) => choice.description)) {
    for (const choice of input.choices) {
      pushWrapped(lines, `  ${input.colors.green(choice.value)}  `, choice.description ?? "", terminalWrapWidth());
    }
  } else {
    pushWrapped(lines, "  ", input.choices.map((choice) => choice.value).join(", "), terminalWrapWidth());
  }
  if (input.helpCommand) {
    lines.push("");
    pushWrapped(lines, "", `Run ${input.colors.bold(input.helpCommand)} for details.`, terminalWrapWidth());
  }
  return lines.join("\n");
}

export function formatMissingGuidance(input: {
  message: string;
  tips: string[];
  colors: CliColors;
}): string {
  const lines = [input.message, ""];
  for (const tip of input.tips) appendTip(lines, tip, input.colors);
  return lines.join("\n");
}

export function messageHasGuidance(message: string): boolean {
  return /(^|\n)tip:|Run `?cy|Use `?cy|Expected:|Available values:|Available commands:/i.test(message);
}

export function appendFallbackGuidance(message: string, input: {
  command: string;
  positional: string[];
  colors: CliColors;
}): string {
  if (messageHasGuidance(message)) return message;
  const lines = [message, ""];
  const idRequired = /\bchange id is required\b/i.test(message);
  const notFound = /^Change not found:/i.test(message);
  if (idRequired) {
    appendTip(lines, `pass a task id such as CY-0001. Run ${input.colors.bold("cy list")} to see available tasks.`, input.colors);
  } else if (notFound) {
    appendTip(lines, `run ${input.colors.bold("cy list")} to see available tasks, then retry with the full or partial task id.`, input.colors);
  } else if (/Missing required option: --task-id/.test(message)) {
    appendTip(lines, `pass ${input.colors.bold("--task-id <id>")}. Run ${input.colors.bold("cy list")} to see available tasks.`, input.colors);
  } else if (/Missing required option: --provider/.test(message)) {
    appendTip(lines, `pass ${input.colors.bold("--provider codex")} or another provider name for the external agent session.`, input.colors);
  } else {
    const helpCommand = input.command === "help" ? "cy --help" : `cy ${input.command} --help`;
    appendTip(lines, `run ${input.colors.bold(helpCommand)} for usage and examples.`, input.colors);
  }
  return lines.join("\n");
}
