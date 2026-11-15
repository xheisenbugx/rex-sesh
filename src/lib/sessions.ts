import { getPreferenceValues } from "@raycast/api";
import { existsSync, statSync } from "node:fs";
import { SeshConfig, SessionConfig, Source, isBlacklisted, loadConfig } from "./config";
import { expandHome, interpolate, sessionNameForPath, shortenHome } from "./paths";
import {
  RexSession,
  focusWindow,
  listSessionIds,
  listSessions,
  newSession,
  newWindow,
  selectSession,
  sendCommand,
} from "./rex";
import { addZoxide, listZoxide } from "./zoxide";

export interface Entry {
  key: string;
  source: Source;
  /** What the list shows as the title. */
  title: string;
  path?: string;
  session?: RexSession;
  config?: SessionConfig;
  score?: number;
}

export interface Listing {
  entries: Entry[];
  config: SeshConfig;
}

export async function loadEntries(): Promise<Listing> {
  const { showZoxide } = getPreferenceValues<Preferences>();
  const config = loadConfig();
  const [live, zoxide] = await Promise.all([listSessions(), showZoxide ? listZoxide() : Promise.resolve([])]);

  const liveLabels = new Set(live.map((s) => s.label));
  const takenPaths = new Set<string>();

  const rexEntries: Entry[] = live
    .filter((s) => !isBlacklisted(config, s.label))
    .map((s) => {
      if (s.cwd) takenPaths.add(s.cwd);
      return { key: `rex:${s.id}`, source: "rex", title: s.label, path: s.cwd, session: s };
    });

  const configEntries: Entry[] = config.session
    .filter((c) => !liveLabels.has(c.name) && !isBlacklisted(config, c.name))
    .map((c) => {
      takenPaths.add(c.path);
      return { key: `config:${c.name}`, source: "config", title: c.name, path: c.path, config: c };
    });

  // Paths of configured sessions that are already live are covered by the live entry.
  for (const c of config.session) if (liveLabels.has(c.name)) takenPaths.add(c.path);

  const zoxideEntries: Entry[] = zoxide
    .filter((z) => !takenPaths.has(z.path))
    .map((z) => ({ ...z, title: shortenHome(z.path) }))
    .filter((z) => !isBlacklisted(config, z.title))
    .map((z) => ({ key: `zoxide:${z.path}`, source: "zoxide", title: z.title, path: z.path, score: z.score }));

  const bySource: Record<Source, Entry[]> = { rex: rexEntries, config: configEntries, zoxide: zoxideEntries };
  return { entries: config.sort_order.flatMap((s) => bySource[s]), config };
}

export interface CreateOptions {
  name?: string;
  path: string;
  startupCommand?: string;
  /** Configured session this request comes from, for its windows and options. */
  config?: SessionConfig;
}

/** Focus a session with this name, or create it in `path`, like `sesh connect`. */
export async function connectPath(options: CreateOptions, seshConfig = loadConfig()): Promise<string> {
  const { useDefaultStartup } = getPreferenceValues<Preferences>();
  const path = expandHome(options.path);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Directory not found: ${path}`);

  const name = options.name?.trim() || options.config?.name || (await sessionNameForPath(path));

  const existing = (await listSessionIds()).find((s) => s.label === name);
  if (existing) {
    await selectSession(existing.session_id);
    await addZoxide(path);
    return existing.session_id;
  }

  const defaults = seshConfig.default_session;
  const cfg = options.config;
  let startup = options.startupCommand ?? cfg?.startup_command;
  if (startup === undefined && !cfg?.disable_startup_command && useDefaultStartup) startup = defaults.startup_command;

  const { sessionId, blockId } = await newSession({ name, cwd: path });
  if (startup?.trim() && blockId) await sendCommand(sessionId, blockId, interpolate(startup, path));

  const windows = cfg?.windows ?? defaults.windows ?? [];
  for (const windowName of windows) {
    const win = seshConfig.window.find((w) => w.name === windowName);
    const cwd = win?.path ? expandHome(win.path) : path;
    const created = await newWindow(sessionId, windowName, cwd);
    if (win?.startup_script?.trim() && created.blockId) {
      await sendCommand(sessionId, created.blockId, interpolate(win.startup_script, cwd));
    }
  }
  if (windows.length > 0) await focusWindow(sessionId, "1").catch(() => undefined);

  await addZoxide(path);
  await selectSession(sessionId);
  return sessionId;
}

export async function connectEntry(entry: Entry, config: SeshConfig): Promise<void> {
  if (entry.session) {
    await selectSession(entry.session.id);
    return;
  }
  if (!entry.path) throw new Error("This entry has no directory");
  await connectPath({ path: entry.path, config: entry.config }, config);
}
