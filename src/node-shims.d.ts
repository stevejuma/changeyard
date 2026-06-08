declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}
declare module "node:child_process" {
  export function spawnSync(command: string, argsOrOptions?: string[] | { cwd?: string; shell?: boolean; encoding?: string }, options?: { cwd?: string; shell?: boolean; encoding?: string }): { status: number | null; stdout?: string; stderr?: string };
}
declare module "node:fs" {
  export function closeSync(fd: number): void;
  export function existsSync(path: string): boolean;
  export function openSync(path: string, flags: string): number;
  export function readFileSync(path: string, encoding: string): string;
  export function renameSync(oldPath: string, newPath: string): void;
  export function writeFileSync(path: string, data: string): void;
  export function copyFileSync(src: string, dest: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readdirSync(path: string): string[];
  export function realpathSync(path: string): string;
  export function statSync(path: string): { isDirectory(): boolean; isFile(): boolean };
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}
declare module "node:os" {
  export function tmpdir(): string;
}
declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(path: string): string;
    basename(path: string, suffix?: string): string;
    relative(from: string, to: string): string;
    isAbsolute(path: string): boolean;
    sep: string;
    posix: { join(...parts: string[]): string };
  };
  export default path;
}
declare module "node:test" {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
}
declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exitCode?: number;
  pid: number;
  platform: string;
  stdout: {
    write(text: string): void;
  };
  versions: {
    node: string;
  };
};
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
declare function fetch(
  input: string | URL,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;
declare class URL {
  constructor(input: string, base?: string);
}
