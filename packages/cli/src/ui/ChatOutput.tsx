/**
 * Conversation transcript: user/assistant/info/error blocks plus the live
 * streaming text of the in-flight assistant turn.
 */

import { Box, Text } from "ink";
import type React from "react";
import { truncate } from "ultracode-shared";
import type { Theme } from "../themes/index.js";

/** Kind of a transcript entry. */
export type ChatEntryKind = "user" | "assistant" | "info" | "error";

/** One block in the transcript. */
export interface ChatEntry {
  kind: ChatEntryKind;
  text: string;
}

/** Cap on rendered characters per entry (terminal protection). */
const MAX_ENTRY_CHARS = 4000;

export interface ChatOutputProps {
  entries: ReadonlyArray<ChatEntry>;
  /** Live streaming text of the current assistant turn ("" when idle). */
  stream: string;
  theme: Theme;
}

function colorFor(kind: ChatEntryKind, theme: Theme): string {
  switch (kind) {
    case "user":
      return theme.user;
    case "assistant":
      return theme.assistant;
    case "info":
      return theme.dim;
    case "error":
      return theme.error;
  }
}

/** Render the transcript. */
export function ChatOutput({ entries, stream, theme }: ChatOutputProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {entries.map((entry, i) => (
        <Box key={i} flexDirection="column" marginBottom={0}>
          <Text color={colorFor(entry.kind, theme)} bold={entry.kind === "user"}>
            {entry.kind === "user" ? "› " : ""}
            {truncate(entry.text, MAX_ENTRY_CHARS)}
          </Text>
        </Box>
      ))}
      {stream !== "" && (
        <Text color={theme.assistant}>
          {truncate(stream, MAX_ENTRY_CHARS)}
          <Text color={theme.dim}>▋</Text>
        </Text>
      )}
    </Box>
  );
}
