import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface LogEntryLike {
  plainText: string;
}

export function buildLogContent(entries: readonly LogEntryLike[]): string {
  return entries.map((e) => e.plainText).join("\n");
}

export function buildDefaultFilename(containerId: string, now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const shortId = containerId.slice(0, 12);
  return `${shortId}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.log`;
}

export async function copyLogs(entries: readonly LogEntryLike[]): Promise<void> {
  await writeText(buildLogContent(entries));
}

export async function exportLogs(
  entries: readonly LogEntryLike[],
  containerId: string
): Promise<boolean> {
  const defaultPath = buildDefaultFilename(containerId);
  const chosen = await save({
    defaultPath,
    filters: [{ name: "Log", extensions: ["log"] }],
  });
  if (!chosen) return false;
  await invoke("write_log_file", { path: chosen, content: buildLogContent(entries) });
  return true;
}
