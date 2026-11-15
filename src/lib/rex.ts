import { getPreferenceValues } from "@raycast/api";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { run } from "./exec";

const REX_BUNDLE_ID = "com.superlogical.rex";

const REX_CANDIDATES = [
  `${homedir()}/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex`,
  "/opt/homebrew/bin/rex",
  "/usr/local/bin/rex",
  `${homedir()}/.local/bin/rex`,
];

let cachedRexPath: string | undefined;

export function rexPath(): string {
  if (cachedRexPath) return cachedRexPath;
  const { rexPath: configured } = getPreferenceValues<Preferences>();
  const path = configured?.trim() || REX_CANDIDATES.find((p) => existsSync(p)) || "rex";
  cachedRexPath = path;
  return path;
}

export function rex(args: string[], timeout?: number): Promise<string> {
  return run(rexPath(), args, { timeout });
}

async function rexJson<T>(args: string[]): Promise<T> {
  const out = await rex([...args, "--json"]);
  return JSON.parse(out) as T;
}

export interface RexSession {
  id: string;
  label: string;
  windowCount: number;
  /** Working directory of the focused pane in the active tab, when known. */
  cwd?: string;
  /** Foreground program name of the focused pane. */
  program?: string;
  focusedBlockId?: string;
}

interface SessionInspect {
  session_id: string;
  label: string;
  active_window_id?: string;
  windows: { window_id: string; label: string; focused_block_id?: string }[];
}

interface BlockProcess {
  foreground?: { name?: string; argv0?: string; cwd?: string };
  ancestors?: { name?: string; cwd?: string }[];
}

export async function listSessionIds(): Promise<{ session_id: string; label: string }[]> {
  const { sessions } = await rexJson<{ sessions: { session_id: string; label: string }[] }>(["ls"]);
  return sessions ?? [];
}

async function describeSession(id: string, label: string): Promise<RexSession> {
  const session: RexSession = { id, label, windowCount: 0 };
  try {
    const info = await rexJson<SessionInspect>(["session", "inspect", id]);
    session.windowCount = info.windows.length;
    const active = info.windows.find((w) => w.window_id === info.active_window_id) ?? info.windows[0];
    session.focusedBlockId = active?.focused_block_id;
    if (session.focusedBlockId) {
      const proc = JSON.parse(
        await rex(["block", "call", "-s", id, "-b", session.focusedBlockId, "process"], 5_000),
      ) as BlockProcess;
      session.cwd = proc.foreground?.cwd ?? proc.ancestors?.find((a) => a.cwd)?.cwd;
      session.program = (proc.foreground?.argv0 ?? proc.foreground?.name)?.replace(/^-/, "");
    }
  } catch {
    // The block may not be a terminal, or the session closed meanwhile.
  }
  return session;
}

export async function listSessions(): Promise<RexSession[]> {
  const ids = await listSessionIds();
  return Promise.all(ids.map((s) => describeSession(s.session_id, s.label)));
}

export interface NewSessionOptions {
  name: string;
  cwd: string;
  firstWindow?: string;
}

export async function newSession({ name, cwd, firstWindow }: NewSessionOptions) {
  const args = ["new", name, "-c", cwd];
  if (firstWindow) args.push("--window", firstWindow);
  const created = await rexJson<{ session_id: string; initial_windows: { window_id: string; block_ids: string[] }[] }>(
    args,
  );
  return { sessionId: created.session_id, blockId: created.initial_windows?.[0]?.block_ids?.[0] };
}

export async function newWindow(sessionId: string, name: string, cwd: string) {
  const created = await rexJson<{ window_id?: string; block_ids: string[] }>([
    "window",
    "new",
    "-s",
    sessionId,
    name,
    "-c",
    cwd,
    "--focus=false",
  ]);
  return { windowId: created.window_id, blockId: created.block_ids?.[0] };
}

/** Type a command into a shell pane and press Return, so the shell survives the command. */
export async function sendCommand(sessionId: string, blockId: string, command: string) {
  await rex(["send", "-s", sessionId, "-b", blockId, command]);
  await rex(["send-key", "-s", sessionId, "-b", blockId, "enter"]);
}

export async function focusWindow(sessionId: string, target: string) {
  await rex(["focus", "-s", sessionId, target]);
}

export async function killSession(id: string) {
  await rex(["kill", id]);
}

export async function renameSession(id: string, label: string) {
  await rex(["session", "rename", id, label]);
}

export async function capture(sessionId: string, blockId: string): Promise<string> {
  return rex(["capture", "-s", sessionId, "-b", blockId, "--trim", "--unwrap"], 5_000);
}

interface ClientInfo {
  client_id: string;
  info?: { kind?: string; label?: string; name?: string };
  connection_state?: string;
}

async function findClient(): Promise<string> {
  const { client: preferred } = getPreferenceValues<Preferences>();
  const { clients } = await rexJson<{ clients: ClientInfo[] }>(["client", "ls"]);
  const apps = (clients ?? []).filter((c) => c.info?.kind === "app" && c.connection_state !== "disconnected");
  const want = preferred?.trim();
  if (want) {
    const match = apps.find((c) => c.info?.label === want || c.client_id === want || c.client_id.endsWith(want));
    if (match) return match.client_id;
    throw new Error(`No connected Rex app matches “${want}”`);
  }
  if (apps.length === 0) throw new Error("No Rex app is connected. Open Rex and try again.");
  return apps[0].client_id;
}

export async function activateApp() {
  try {
    await run("/usr/bin/open", ["-b", REX_BUNDLE_ID]);
  } catch {
    // The app may be installed under another bundle ID; selecting still works.
  }
}

export async function clientAction(action: string, args: Record<string, string> = {}) {
  const client = await findClient();
  const pairs = Object.entries(args).map(([k, v]) => `${k}=${v}`);
  await rex(["-C", client, "do", action, ...pairs]);
}

/** Bring Rex to the front and show the session. */
export async function selectSession(sessionId: string) {
  await activateApp();
  await clientAction("session.select", { session_id: sessionId });
}
