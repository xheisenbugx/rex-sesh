import { execFile } from "node:child_process";
import { homedir } from "node:os";

// Raycast launches commands with a minimal PATH, so add the usual install locations.
const EXTRA_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  `${homedir()}/.local/bin`,
  `${homedir()}/.cargo/bin`,
  "/usr/bin",
  "/bin",
];

export const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: [...EXTRA_PATHS, process.env.PATH ?? ""].filter(Boolean).join(":"),
  // Never inherit a pane's location; Raycast is not running inside Rex.
  REX_SESSION: "",
  REX_BLOCK: "",
};

export class CommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code: number | string | null,
  ) {
    super(message);
  }
}

export function run(file: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env: ENV, cwd: opts.cwd, timeout: opts.timeout ?? 15_000, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || error.message).toString().trim();
          const code = (error as NodeJS.ErrnoException).code ?? null;
          reject(new CommandError(detail, stderr.toString(), code));
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}
