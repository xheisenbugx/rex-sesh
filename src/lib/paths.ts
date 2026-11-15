import { homedir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { run } from "./exec";

const HOME = homedir();

export function expandHome(path: string): string {
  if (path === "~") return HOME;
  if (path.startsWith("~/")) return resolve(HOME, path.slice(2));
  return path;
}

export function shortenHome(path: string): string {
  if (path === HOME) return "~";
  if (path.startsWith(HOME + "/")) return "~" + path.slice(HOME.length);
  return path;
}

/** Quote a value for safe use in a POSIX shell command line. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Replace sesh's `{}` placeholder with the quoted session path. */
export function interpolate(command: string, path: string): string {
  return command.replace(/\{\}/g, shellQuote(path));
}

/**
 * Pick a session name like sesh does: the Git repository name, plus the path
 * inside the repository for nested directories, or the directory's basename.
 */
export async function sessionNameForPath(path: string): Promise<string> {
  try {
    const top = (await run("git", ["-C", path, "rev-parse", "--show-toplevel"], { timeout: 3_000 })).trim();
    if (top) {
      const inner = relative(top, path);
      const repo = basename(top) || basename(dirname(top));
      return inner && !inner.startsWith("..") ? `${repo}/${inner}` : repo;
    }
  } catch {
    // Not a git repository; fall through.
  }
  return basename(path) || path;
}
