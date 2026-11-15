import { run } from "./exec";
import { SeshConfig } from "./config";
import { interpolate } from "./paths";
import { capture } from "./rex";
import { Entry } from "./sessions";

const MAX_LINES = 80;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)|\u001b[()][A-Za-z0-9]/g;

function clean(text: string): string {
  const lines = text.replace(ANSI, "").replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.slice(-MAX_LINES).join("\n");
}

function fence(text: string): string {
  const body = text.trim() ? text : "(empty)";
  const ticks = body.includes("```") ? "~~~~" : "```";
  return `${ticks}\n${body}\n${ticks}`;
}

export async function renderPreview(entry: Entry, config: SeshConfig): Promise<string> {
  try {
    if (entry.session) {
      if (!entry.session.focusedBlockId) return "_No terminal pane to preview._";
      return fence(clean(await capture(entry.session.id, entry.session.focusedBlockId)));
    }
    if (!entry.path) return "";
    const command = entry.config?.preview_command ?? config.default_session.preview_command;
    if (command?.trim()) {
      return fence(clean(await run("/bin/sh", ["-c", interpolate(command, entry.path)], { cwd: entry.path })));
    }
    return fence(clean(await run("/bin/ls", ["-1Ap", entry.path])));
  } catch (error) {
    return `_Preview unavailable: ${error instanceof Error ? error.message : String(error)}_`;
  }
}
