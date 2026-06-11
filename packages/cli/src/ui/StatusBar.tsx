/**
 * Bottom status bar: active agent, model, session id and token usage.
 */

import React from "react";
import { Box, Text } from "ink";
import type { Theme } from "../themes/index.js";

export interface StatusBarProps {
  agent: string;
  model: string;
  sessionId?: string;
  /** Cumulative token usage of this UI session. */
  usage: { input: number; output: number };
  theme: Theme;
  themeName: string;
}

/** Shorten a session id for display (first 8 characters). */
export function shortSessionId(id?: string): string {
  if (id === undefined || id === "") return "new";
  return Array.from(id).slice(0, 8).join("");
}

/** Render the status bar. */
export function StatusBar({
  agent,
  model,
  sessionId,
  usage,
  theme,
  themeName,
}: StatusBarProps): React.JSX.Element {
  return (
    <Box>
      <Text color={theme.dim}>
        <Text color={theme.primary} bold>
          {agent}
        </Text>
        {" · "}
        {model}
        {" · session:"}
        {shortSessionId(sessionId)}
        {" · tokens "}
        {usage.input}/{usage.output}
        {" · theme:"}
        {themeName}
        {" · shift+tab: agent · esc: cancel · ctrl+c ctrl+c: exit"}
      </Text>
    </Box>
  );
}
