import { Keyboard, getPreferenceValues } from "@raycast/api";

type Modifier = Keyboard.KeyModifier;
type Key = Keyboard.KeyEquivalent;
export type SimpleShortcut = { modifiers: Modifier[]; key: Key };

/** Actions in the Search Sessions list whose shortcut can be changed in preferences. */
export const SHORTCUT_DEFAULTS = {
  shortcutConnectWithOptions: "cmd+shift+enter",
  shortcutRename: "cmd+e",
  shortcutKill: "ctrl+x",
  shortcutTogglePreview: "cmd+shift+p",
  shortcutNewSession: "cmd+n",
  shortcutRefresh: "cmd+shift+r",
  shortcutShowInFinder: "cmd+o",
  shortcutCopyPath: "cmd+shift+c",
  shortcutEditConfig: "cmd+shift+,",
} as const;

export type ShortcutName = keyof typeof SHORTCUT_DEFAULTS;

const MODIFIERS: Record<string, Modifier> = {
  cmd: "cmd",
  command: "cmd",
  "⌘": "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  "⌃": "ctrl",
  opt: "opt",
  option: "opt",
  alt: "opt",
  "⌥": "opt",
  shift: "shift",
  "⇧": "shift",
};

const KEYS = new Set<string>([
  ..."abcdefghijklmnopqrstuvwxyz0123456789",
  ...".,;=+-[]{}«»()/\\'`§^@$",
  "return",
  "delete",
  "deleteForward",
  "tab",
  "arrowUp",
  "arrowDown",
  "arrowLeft",
  "arrowRight",
  "pageUp",
  "pageDown",
  "home",
  "end",
  "space",
  "escape",
  "enter",
  "backspace",
]);

const KEY_ALIASES: Record<string, Key> = {
  "↩": "return",
  "⏎": "enter",
  "⌫": "backspace",
  "⌦": "deleteForward",
  "⇥": "tab",
  "⎋": "escape",
  esc: "escape",
  up: "arrowUp",
  down: "arrowDown",
  left: "arrowLeft",
  right: "arrowRight",
  "↑": "arrowUp",
  "↓": "arrowDown",
  "←": "arrowLeft",
  "→": "arrowRight",
  comma: ",",
  period: ".",
  plus: "+",
  minus: "-",
  slash: "/",
};

// Shortcuts Raycast keeps for itself, which it would silently ignore.
const RESERVED = new Set(["cmd+k", "cmd+w", "cmd+q", "cmd+h", "cmd+,", "cmd+enter", "cmd+return", "cmd+escape"]);

const DISABLED = new Set(["none", "off", "disabled", "-"]);

export type Parsed = { ok: true; shortcut: SimpleShortcut | undefined } | { ok: false; error: string };

/**
 * Parse a shortcut such as `cmd+shift+p`, `ctrl x`, or `⌘⇧P`.
 * `none` turns the shortcut off. Every shortcut needs at least one modifier,
 * because plain keys type into the search bar.
 */
export function parseShortcut(text: string): Parsed {
  const value = text.trim();
  if (DISABLED.has(value.toLowerCase())) return { ok: true, shortcut: undefined };

  // Split symbolic modifiers (⌘⇧P) as well as `+`, `-` and space separators, keeping a trailing `+` or `-` key.
  const tokens: string[] = [];
  let rest = value.replace(/([⌘⌃⌥⇧])/g, " $1 ");
  const trailing = rest.match(/[+\-\s]([+-])$/);
  if (trailing) rest = rest.slice(0, -1);
  tokens.push(...rest.split(/[\s+]+|(?<=\w)-(?=\w)/).filter(Boolean));
  if (trailing) tokens.push(trailing[1]);
  if (tokens.length === 0) return { ok: false, error: "is empty" };

  const keyToken = tokens.pop()!;
  const modifiers: Modifier[] = [];
  for (const token of tokens) {
    const mod = MODIFIERS[token.toLowerCase()];
    if (!mod) return { ok: false, error: `has an unknown modifier “${token}”` };
    if (!modifiers.includes(mod)) modifiers.push(mod);
  }
  if (modifiers.length === 0) return { ok: false, error: "needs a modifier such as cmd, ctrl, opt, or shift" };

  const lower = keyToken.toLowerCase();
  const key = KEY_ALIASES[keyToken] ?? KEY_ALIASES[lower] ?? [...KEYS].find((k) => k.toLowerCase() === lower);
  if (!key) return { ok: false, error: `has an unknown key “${keyToken}”` };

  const id = formatId(modifiers, key);
  if (RESERVED.has(id)) return { ok: false, error: "is reserved by Raycast" };
  return { ok: true, shortcut: { modifiers, key: key as Key } };
}

const MOD_ORDER: Modifier[] = ["ctrl", "opt", "shift", "cmd"];

function formatId(modifiers: Modifier[], key: string): string {
  const sorted = [...modifiers].sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...sorted, key === "return" ? "enter" : key].join("+");
}

export interface ResolvedShortcuts {
  shortcuts: Record<ShortcutName, SimpleShortcut | undefined>;
  problems: string[];
}

const LABELS: Record<ShortcutName, string> = {
  shortcutConnectWithOptions: "Create with Options",
  shortcutRename: "Rename Session",
  shortcutKill: "Kill Session",
  shortcutTogglePreview: "Toggle Preview",
  shortcutNewSession: "New Session",
  shortcutRefresh: "Refresh",
  shortcutShowInFinder: "Show in Finder",
  shortcutCopyPath: "Copy Path",
  shortcutEditConfig: "Edit Config",
};

/** Read shortcut preferences, falling back to the default for empty or invalid values. */
export function resolveShortcuts(): ResolvedShortcuts {
  const prefs = getPreferenceValues<Preferences.Sessions>() as unknown as Record<string, string | undefined>;
  const problems: string[] = [];
  const shortcuts = {} as Record<ShortcutName, SimpleShortcut | undefined>;
  const used = new Map<string, ShortcutName>();

  for (const name of Object.keys(SHORTCUT_DEFAULTS) as ShortcutName[]) {
    const fallback = SHORTCUT_DEFAULTS[name];
    const custom = prefs[name]?.trim();
    let parsed = parseShortcut(custom || fallback);
    if (!parsed.ok) {
      problems.push(`${LABELS[name]}: “${custom}” ${parsed.error}. Using ${fallback}.`);
      parsed = parseShortcut(fallback);
    }
    let shortcut = parsed.ok ? parsed.shortcut : undefined;
    if (shortcut) {
      const id = formatId(shortcut.modifiers, shortcut.key);
      const clash = used.get(id);
      if (clash) {
        problems.push(`${LABELS[name]}: ${id} is already used by ${LABELS[clash]}. Shortcut turned off.`);
        shortcut = undefined;
      } else {
        used.set(id, name);
      }
    }
    shortcuts[name] = shortcut;
  }
  return { shortcuts, problems };
}
