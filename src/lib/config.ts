import { getPreferenceValues } from "@raycast/api";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parse } from "smol-toml";
import { expandHome } from "./paths";

export interface WindowConfig {
  name: string;
  startup_script?: string;
  path?: string;
}

export interface SessionConfig {
  name: string;
  path: string;
  startup_command?: string;
  preview_command?: string;
  disable_startup_command?: boolean;
  windows?: string[];
}

export type Source = "rex" | "config" | "zoxide";

export interface SeshConfig {
  file?: string;
  default_session: { startup_command?: string; preview_command?: string; windows?: string[] };
  session: SessionConfig[];
  window: WindowConfig[];
  blacklist: string[];
  sort_order: Source[];
}

const DEFAULT_SORT: Source[] = ["rex", "config", "zoxide"];

export function configCandidates(): string[] {
  const { configPath } = getPreferenceValues<Preferences>();
  if (configPath?.trim()) return [expandHome(configPath.trim())];
  const base = process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config");
  return [resolve(base, "rex-sesh", "sesh.toml"), resolve(base, "sesh", "sesh.toml")];
}

export function defaultConfigPath(): string {
  return configCandidates()[0];
}

type Raw = Record<string, unknown>;

function readToml(file: string, seen: Set<string>): Raw {
  if (seen.has(file) || !existsSync(file)) return {};
  seen.add(file);
  const raw = parse(readFileSync(file, "utf8")) as Raw;
  // sesh supports `import = ["other.toml"]`; imported sessions and windows are appended.
  const imports = Array.isArray(raw.import) ? (raw.import as string[]) : [];
  for (const entry of imports) {
    const path = resolve(dirname(file), expandHome(entry));
    const sub = readToml(path, seen);
    for (const key of ["session", "window"]) {
      if (Array.isArray(sub[key])) raw[key] = [...((raw[key] as unknown[]) ?? []), ...(sub[key] as unknown[])];
    }
  }
  return raw;
}

export function loadConfig(): SeshConfig {
  const file = configCandidates().find((f) => existsSync(f));
  const raw = file ? readToml(file, new Set()) : {};
  const sortOrder = Array.isArray(raw.sort_order)
    ? (raw.sort_order as string[])
        .map((s) => (s === "tmux" ? "rex" : s))
        .filter((s): s is Source => DEFAULT_SORT.includes(s as Source))
    : [];
  for (const s of DEFAULT_SORT) if (!sortOrder.includes(s)) sortOrder.push(s);

  return {
    file,
    default_session: (raw.default_session as SeshConfig["default_session"]) ?? {},
    session: ((raw.session as SessionConfig[]) ?? [])
      .filter((s) => s?.name && s?.path)
      .map((s) => ({ ...s, path: expandHome(s.path) })),
    window: ((raw.window as WindowConfig[]) ?? []).filter((w) => w?.name),
    blacklist: (raw.blacklist as string[]) ?? [],
    sort_order: sortOrder,
  };
}

export function isBlacklisted(config: SeshConfig, name: string): boolean {
  return config.blacklist.some((pattern) => {
    try {
      return new RegExp(pattern).test(name);
    } catch {
      return name === pattern;
    }
  });
}
