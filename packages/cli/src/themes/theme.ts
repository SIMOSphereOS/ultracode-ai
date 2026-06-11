/**
 * Colour-token contract for CLI themes.
 *
 * Tokens are Ink colour strings (named colours like `"cyan"` or hex values
 * like `"#bd93f9"`) — no chalk, no raw ANSI. Components only ever reference
 * tokens, never literal colours.
 */
export interface Theme {
  /** Canonical theme name. */
  name: string;
  /** Primary brand/prompt colour. */
  primary: string;
  /** Secondary accents (labels, separators). */
  secondary: string;
  /** Highlight accent. */
  accent: string;
  /** Default body text. */
  text: string;
  /** De-emphasised text (placeholders, hints). */
  dim: string;
  /** Success markers. */
  success: string;
  /** Warnings/transient hints. */
  warning: string;
  /** Errors. */
  error: string;
  /** User chat entries. */
  user: string;
  /** Assistant chat entries. */
  assistant: string;
  /** Tool activity. */
  tool: string;
}
