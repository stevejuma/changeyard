export type ColorChoice = "always" | "never" | "auto";

export type ColorSupportOptions = {
  choice?: ColorChoice;
  env?: NodeJS.ProcessEnv;
  stream?: NodeJS.WriteStream;
};

export type CliColors = {
  enabled: boolean;
  bold: (value: string) => string;
  green: (value: string) => string;
  yellow: (value: string) => string;
  red: (value: string) => string;
  blue: (value: string) => string;
  cyan: (value: string) => string;
  magenta: (value: string) => string;
  dim: (value: string) => string;
};

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  magenta: "\u001b[35m",
};

export function parseColorChoice(value: string | undefined): ColorChoice {
  if (value === undefined || value === "") return "auto";
  if (value === "always" || value === "never" || value === "auto") return value;
  throw new Error(`Invalid color value "${value}". Expected one of: always, never, auto`);
}

function forceColorEnabled(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "" || value === "0" || value.toLowerCase() === "false") return false;
  return true;
}

export function colorEnabled(options: ColorSupportOptions = {}): boolean {
  const choice = options.choice ?? "auto";
  if (choice === "always") return true;
  if (choice === "never") return false;

  const env = options.env ?? process.env;
  if (env.NO_COLOR !== undefined) return false;
  const forced = forceColorEnabled(env.FORCE_COLOR);
  if (forced !== null) return forced;
  if (env.TERM === "dumb") return false;

  const stream = options.stream ?? process.stdout;
  return stream.isTTY === true;
}

function wrap(enabled: boolean, code: string, value: string): string {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}

export function createColors(enabled: boolean): CliColors {
  return {
    enabled,
    bold: (value) => wrap(enabled, ANSI.bold, value),
    green: (value) => wrap(enabled, ANSI.green, value),
    yellow: (value) => wrap(enabled, ANSI.yellow, value),
    red: (value) => wrap(enabled, ANSI.red, value),
    blue: (value) => wrap(enabled, ANSI.blue, value),
    cyan: (value) => wrap(enabled, ANSI.cyan, value),
    magenta: (value) => wrap(enabled, ANSI.magenta, value),
    dim: (value) => wrap(enabled, ANSI.dim, value),
  };
}

