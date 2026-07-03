/**
 * Compact display of recent `tool.executed` events from the facade event bus.
 */

import { Box, Text } from "ink";
import type React from "react";
import type { Theme } from "../themes/index.js";

/** A condensed `tool.executed` event. */
export interface ToolEventView {
  toolName: string;
  ok: boolean;
  durationMs: number;
}

export interface ToolOutputProps {
  events: ReadonlyArray<ToolEventView>;
  theme: Theme;
  /** Maximum number of events to show (most recent last). */
  max?: number;
}

/** Render the recent tool executions, or nothing when there are none. */
export function ToolOutput({ events, theme, max = 5 }: ToolOutputProps): React.JSX.Element | null {
  if (events.length === 0) return null;
  const shown = events.slice(-max);
  return (
    <Box flexDirection="column">
      {shown.map((e, i) => (
        <Text key={i} color={theme.tool}>
          {e.ok ? "✓" : "✗"} {e.toolName}{" "}
          <Text color={theme.dim}>({Math.round(e.durationMs)}ms)</Text>
        </Text>
      ))}
    </Box>
  );
}
