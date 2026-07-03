/**
 * Chat input line with prompt history (Up/Down arrows) and multiline support
 * (Ctrl+J inserts a newline; Enter submits).
 *
 * No cursor movement — input is append/backspace only, which keeps the
 * component robust across terminals.
 */

import { Box, Text, useInput } from "ink";
import type React from "react";
import { useRef, useState } from "react";
import type { Theme } from "../themes/index.js";

export interface ChatInputProps {
  /** Called with the raw (possibly multiline) input on Enter. */
  onSubmit: (text: string) => void;
  theme: Theme;
  /** Disable input handling (e.g. while a run is in flight). */
  disabled?: boolean;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
}

/** Remove the last user-perceived character (surrogate-pair safe). */
function dropLastChar(s: string): string {
  return Array.from(s).slice(0, -1).join("");
}

/** Render the input line and manage history/multiline state. */
export function ChatInput({
  onSubmit,
  theme,
  disabled = false,
  placeholder = "Type a message — /help for commands",
}: ChatInputProps): React.JSX.Element {
  const [value, setValueState] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const draftRef = useRef("");
  // Mirror of `value` that is updated synchronously: several key events can
  // arrive within one render tick (fast typing/paste), and Enter must submit
  // what was actually typed, not the value of the last committed render.
  const valueRef = useRef("");

  const setValue = (next: string | ((prev: string) => string)): void => {
    setValueState(() => {
      const resolved = typeof next === "function" ? next(valueRef.current) : next;
      valueRef.current = resolved;
      return resolved;
    });
  };

  useInput(
    (input, key) => {
      if (key.escape || key.tab || key.ctrl || key.meta) return;
      if (key.return) {
        const text = valueRef.current;
        if (text.trim() !== "") {
          setHistory((h) => [...h, text]);
        }
        setValue("");
        setCursor(null);
        draftRef.current = "";
        if (text.trim() !== "") onSubmit(text);
        return;
      }
      if (key.upArrow) {
        if (history.length === 0) return;
        const idx = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
        if (cursor === null) draftRef.current = valueRef.current;
        setCursor(idx);
        setValue(history[idx] ?? "");
        return;
      }
      if (key.downArrow) {
        if (cursor === null) return;
        if (cursor >= history.length - 1) {
          setCursor(null);
          setValue(draftRef.current);
        } else {
          const idx = cursor + 1;
          setCursor(idx);
          setValue(history[idx] ?? "");
        }
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => dropLastChar(v));
        setCursor(null);
        return;
      }
      if (key.leftArrow || key.rightArrow || key.pageUp || key.pageDown) return;
      if (input !== "") {
        // Ctrl+J arrives as a bare "\n" (multiline); pasted text may also
        // contain newlines — both are appended verbatim.
        setValue((v) => v + input);
        setCursor(null);
      }
    },
    { isActive: !disabled },
  );

  const lines = value.split("\n");
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={theme.primary} bold>
            {i === 0 ? "❯ " : "… "}
          </Text>
          {i === 0 && value === "" ? (
            <Text color={theme.dim}>
              {disabled ? "(thinking — press Esc to cancel)" : placeholder}
            </Text>
          ) : (
            <Text color={theme.text}>{line}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
