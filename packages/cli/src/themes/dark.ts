import type { Theme } from "./theme.js";

/** Default dark theme (Ink colour names, safe on dark terminal backgrounds). */
export const dark: Theme = {
  name: "dark",
  primary: "cyan",
  secondary: "magenta",
  accent: "blueBright",
  text: "white",
  dim: "gray",
  success: "green",
  warning: "yellow",
  error: "red",
  user: "cyanBright",
  assistant: "white",
  tool: "yellow",
};
