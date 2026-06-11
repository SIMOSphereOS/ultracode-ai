/**
 * Small file-system helpers shared by the file tools.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { generateId } from "@ultracode/shared";

/** Number of leading bytes inspected by {@link isBinaryFile}. */
export const BINARY_SNIFF_BYTES = 8192;

/**
 * NUL-byte heuristic: a file is considered binary when its first
 * {@link BINARY_SNIFF_BYTES} bytes contain a `0x00`.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const len = Math.min(BINARY_SNIFF_BYTES, stat.size);
    if (len === 0) return false;
    const buf = Buffer.alloc(len);
    await handle.read(buf, 0, len, 0);
    return buf.includes(0);
  } finally {
    await handle.close();
  }
}

/**
 * Atomic write: writes to a temporary sibling file and renames it over the
 * target, so readers never observe a half-written file. Creates parent
 * directories (`mkdir -p`).
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${generateId().slice(0, 8)}.tmp`);
  try {
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Split file content into lines, tolerating `\n` and `\r\n` endings. */
export function splitLines(content: string): string[] {
  return content.split(/\r\n|\n/);
}
