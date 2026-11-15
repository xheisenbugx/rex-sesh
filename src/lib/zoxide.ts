import { run } from "./exec";

export interface ZoxideEntry {
  path: string;
  score: number;
}

export async function listZoxide(): Promise<ZoxideEntry[]> {
  try {
    const out = await run("zoxide", ["query", "--list", "--score"]);
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);
        return match ? { score: Number(match[1]), path: match[2] } : { score: 0, path: line };
      });
  } catch {
    return [];
  }
}

export async function addZoxide(path: string) {
  try {
    await run("zoxide", ["add", "--", path]);
  } catch {
    // zoxide is optional.
  }
}
