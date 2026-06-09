import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { repoRootFromModule } from "../dev/paths.js";

export type InstallCliOptions = {
  dir?: string;
  dryRun?: boolean;
};

export function defaultInstallDir(): string {
  if (process.env.CHANGEYARD_INSTALL_DIR) {
    return path.resolve(process.env.CHANGEYARD_INSTALL_DIR);
  }
  return path.join(homedir(), ".local", "bin");
}

export function cliBinNames(repoRoot: string): string[] {
  const packagePath = path.join(repoRoot, "package.json");
  if (!existsSync(packagePath)) {
    return ["cy", "changeyard"];
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { bin?: Record<string, string> };
  if (!pkg.bin || typeof pkg.bin !== "object") {
    return ["cy", "changeyard"];
  }
  return Object.keys(pkg.bin).sort();
}

export function resolveLauncherPath(fromModuleUrl: string | URL = import.meta.url): string {
  const repoRoot = repoRootFromModule(fromModuleUrl);
  const launcher = path.join(repoRoot, "scripts", "cy.mjs");
  if (!existsSync(launcher)) {
    throw new Error(
      `Changeyard launcher not found at ${launcher}. Run install from a Changeyard checkout or package root.`,
    );
  }
  return path.resolve(launcher);
}

function pathInPath(dir: string): boolean {
  const parts = (process.env.PATH ?? "").split(path.delimiter);
  return parts.includes(dir);
}

function normalizeLinkTarget(linkPath: string): string | null {
  if (!existsSync(linkPath)) return null;
  try {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      return path.resolve(path.dirname(linkPath), readlinkSync(linkPath));
    }
    return path.resolve(linkPath);
  } catch {
    return null;
  }
}

export function ensureExecutable(filePath: string, dryRun = false): boolean {
  const mode = statSync(filePath).mode & 0o777;
  if (mode & 0o100) {
    return false;
  }
  if (!dryRun) {
    chmodSync(filePath, mode | 0o111);
  }
  return true;
}

export function runInstallCli(options: InstallCliOptions = {}, fromModuleUrl: string | URL = import.meta.url): string {
  const installDir = path.resolve(options.dir ?? defaultInstallDir());
  const launcher = resolveLauncherPath(fromModuleUrl);
  const repoRoot = repoRootFromModule(fromModuleUrl);
  const names = cliBinNames(repoRoot);
  const lines: string[] = [];

  if (ensureExecutable(launcher, options.dryRun)) {
    lines.push(options.dryRun ? `Dry-run: would chmod +x ${launcher}` : `Made executable: ${launcher}`);
  }

  if (!options.dryRun) {
    mkdirSync(installDir, { recursive: true });
  }

  for (const name of names) {
    const linkPath = path.join(installDir, name);
    const existing = normalizeLinkTarget(linkPath);
    if (existing === launcher) {
      lines.push(`Already linked: ${linkPath}`);
      continue;
    }
    if (existing !== null) {
      throw new Error(`Refusing to overwrite existing command at ${linkPath}`);
    }
    if (options.dryRun) {
      lines.push(`Dry-run: would link ${linkPath} -> ${launcher}`);
    } else {
      symlinkSync(launcher, linkPath);
      lines.push(`Linked ${linkPath} -> ${launcher}`);
    }
  }

  if (!pathInPath(installDir)) {
    lines.push(`Add ${installDir} to your PATH, for example:`);
    lines.push(`  export PATH="${installDir}:$PATH"`);
  }

  return lines.join("\n");
}

export function runUninstallCli(options: InstallCliOptions = {}, fromModuleUrl: string | URL = import.meta.url): string {
  const installDir = path.resolve(options.dir ?? defaultInstallDir());
  const launcher = resolveLauncherPath(fromModuleUrl);
  const repoRoot = repoRootFromModule(fromModuleUrl);
  const names = cliBinNames(repoRoot);
  const lines: string[] = [];

  for (const name of names) {
    const linkPath = path.join(installDir, name);
    if (!existsSync(linkPath)) {
      lines.push(`Not installed: ${linkPath}`);
      continue;
    }
    const existing = normalizeLinkTarget(linkPath);
    if (existing !== launcher) {
      lines.push(`Skipped ${linkPath} (not a Changeyard install)`);
      continue;
    }
    if (options.dryRun) {
      lines.push(`Dry-run: would remove ${linkPath}`);
    } else {
      unlinkSync(linkPath);
      lines.push(`Removed ${linkPath}`);
    }
  }

  if (lines.every((line) => line.startsWith("Not installed"))) {
    lines.unshift(`No Changeyard commands found in ${installDir}`);
  }

  return lines.join("\n");
}
