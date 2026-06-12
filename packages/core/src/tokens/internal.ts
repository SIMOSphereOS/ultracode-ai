/**
 * Internal, dependency-free helpers shared by the optimizer stages.
 *
 * Everything here is pure and uses only `node:crypto` from the builtins. None
 * of it is part of the public API.
 */

import { createHash } from "node:crypto";

/** Stable, collision-resistant hash of a block, used for dedup. */
export function hashBlock(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Split text into fenced/non-fenced segments so whitespace-sensitive code is
 * never reflowed.
 *
 * A fence is a line whose trimmed form starts with ``` (three or more
 * backticks) or ~~~. Everything between an opening and the matching closing
 * fence (inclusive) is one `code` segment; the rest are `prose` segments. An
 * unterminated fence runs to end-of-string (treated as code, conservatively).
 *
 * The concatenation of all segment `text` values exactly reconstructs the
 * input (no characters added or dropped).
 */
export function splitCodeFences(text: string): Array<{ kind: "prose" | "code"; text: string }> {
  const segments: Array<{ kind: "prose" | "code"; text: string }> = [];
  const lines = text.split("\n");
  let buffer: string[] = [];
  let mode: "prose" | "code" = "prose";
  let fenceToken: string | null = null;

  const flush = (kind: "prose" | "code"): void => {
    if (buffer.length === 0) return;
    segments.push({ kind, text: buffer.join("\n") });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const trimmed = line.trimStart();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (mode === "prose") {
      if (fenceMatch) {
        flush("prose");
        mode = "code";
        fenceToken = (fenceMatch[1] as string)[0] as string;
        buffer.push(line);
      } else {
        buffer.push(line);
      }
    } else {
      buffer.push(line);
      // A closing fence is a line of the same fence character (>=3) with no
      // trailing info string.
      if (fenceMatch && (fenceMatch[1] as string)[0] === fenceToken && trimmed === (fenceMatch[1] as string)) {
        flush("code");
        mode = "prose";
        fenceToken = null;
      }
    }
  }
  // Flush trailing buffer in its current mode (unterminated fence stays code).
  flush(mode);
  return segments;
}

/**
 * Collapse runs of 3+ blank lines to a single blank line and strip trailing
 * whitespace from each line. Operates on a *prose* segment only.
 */
export function normalizeProseWhitespace(text: string): string {
  const trimmedLines = text.split("\n").map((l) => l.replace(/[ \t]+$/u, ""));
  const out: string[] = [];
  let blankRun = 0;
  for (const line of trimmedLines) {
    if (line === "") {
      blankRun += 1;
      if (blankRun <= 1) out.push(line);
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  return out.join("\n");
}

/**
 * Split prose into "blocks" separated by one or more blank lines. Fenced code
 * blocks are kept intact as single blocks. Returns the blocks plus the exact
 * separators between them so the text can be rebuilt losslessly.
 */
export function splitBlocks(text: string): string[] {
  // A block boundary is a blank line (possibly with surrounding whitespace).
  // We keep code fences atomic by first segmenting on fences.
  const segments = splitCodeFences(text);
  const blocks: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "code") {
      blocks.push(seg.text);
      continue;
    }
    for (const para of seg.text.split(/\n[ \t]*\n/u)) {
      if (para.trim() !== "") blocks.push(para);
    }
  }
  return blocks;
}

/** Truncate `text` to `maxChars` at a word boundary, never splitting a surrogate pair. */
export function truncateAtWord(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  let slice = text.slice(0, maxChars);
  // Do not end in the middle of a surrogate pair.
  const lastCode = slice.charCodeAt(slice.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) slice = slice.slice(0, -1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) slice = slice.slice(0, lastSpace);
  return slice.trimEnd();
}
