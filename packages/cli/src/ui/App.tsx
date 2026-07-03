/**
 * Interactive UltraCode UI (Ink).
 *
 * Key bindings:
 * - Enter submits, Ctrl+J inserts a newline, Up/Down navigates input history.
 * - Esc aborts the in-flight run (AbortController).
 * - Shift+Tab cycles through the available agents.
 * - Ctrl+C twice (within 1.5 s) exits.
 *
 * Slash commands: /help /agents [name] /tools /config show /theme <name>
 * /clear /exit.
 */

import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompletionChunk } from "ultracode-shared";
import { serializeError } from "ultracode-shared";
import type { UltraCodeFacade } from "../context.js";
import { ThemeManager } from "../themes/index.js";
import { redactConfig } from "../utils/text.js";
import { ChatInput } from "./ChatInput.js";
import { type ChatEntry, ChatOutput } from "./ChatOutput.js";
import { DoublePress } from "./ctrl-c.js";
import { StatusBar } from "./StatusBar.js";
import { type ToolEventView, ToolOutput } from "./ToolOutput.js";

export interface AppProps {
  facade: UltraCodeFacade;
  /** Initial theme name; defaults to the configured `ui.theme`. */
  initialTheme?: string;
  /** Invoked once when the user exits the UI. */
  onExit?: () => void;
}

const HELP_TEXT = [
  "Slash commands:",
  "  /help           show this help",
  "  /agents [name]  list agents (or show one agent)",
  "  /tools          list available tools",
  "  /config show    print the configuration (secrets masked)",
  "  /theme <name>   switch theme (dark/light/dracula)",
  "  /clear          clear the transcript",
  "  /exit           leave UltraCode",
  "Keys: Enter send · Ctrl+J newline · ↑/↓ history · Shift+Tab agent · Esc cancel · Ctrl+C Ctrl+C exit",
].join("\n");

/** Root component of the interactive mode. */
export function App({ facade, initialTheme, onExit }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const themes = useMemo(() => new ThemeManager(), []);
  const [themeName, setThemeName] = useState(
    themes.get(initialTheme ?? facade.config.ui.theme).name,
  );
  const theme = themes.get(themeName);

  const agents = useMemo(() => facade.listAgents(), [facade]);
  const agentNames = useMemo(
    () => (agents.length > 0 ? agents.map((a) => a.name) : [facade.config.agents.default]),
    [agents, facade],
  );
  const [agentIndex, setAgentIndex] = useState(() => {
    const idx = agentNames.indexOf(facade.config.agents.default);
    return idx >= 0 ? idx : 0;
  });
  const agentName = agentNames[agentIndex] ?? agentNames[0] ?? "default";
  const model = agents.find((a) => a.name === agentName)?.model ?? facade.config.core.activeModel;

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [stream, setStream] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEventView[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [usage, setUsage] = useState({ input: 0, output: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const ctrlC = useRef(new DoublePress());

  useEffect(() => {
    const offTool = facade.events.on("tool.executed", (e) => {
      setToolEvents((prev) => [
        ...prev.slice(-19),
        { toolName: e.toolName, ok: e.ok, durationMs: e.durationMs },
      ]);
    });
    const offSession = facade.events.on("session.started", (e) => {
      setSessionId(e.sessionId);
    });
    return () => {
      offTool();
      offSession();
    };
  }, [facade]);

  const doExit = useCallback(() => {
    abortRef.current?.abort();
    exit();
    onExit?.();
  }, [exit, onExit]);

  useInput((input, key) => {
    if (key.escape) {
      abortRef.current?.abort();
      return;
    }
    if (key.tab && key.shift) {
      setAgentIndex((i) => (i + 1) % agentNames.length);
      return;
    }
    if (key.ctrl && input === "c") {
      if (ctrlC.current.press()) {
        doExit();
      } else {
        setHint("Press Ctrl+C again to exit");
      }
    }
  });

  const pushEntry = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const runPrompt = useCallback(
    async (prompt: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setHint("");
      pushEntry({ kind: "user", text: prompt });
      let acc = "";
      setStream("");
      try {
        const result = await facade.run(prompt, {
          agent: agentName,
          sessionId,
          signal: controller.signal,
          onChunk: (chunk: CompletionChunk) => {
            if (chunk.type === "text" && typeof chunk.text === "string" && chunk.text !== "") {
              acc += chunk.text;
              setStream(acc);
            }
          },
        });
        setUsage((u) => ({
          input: u.input + result.usage.inputTokens,
          output: u.output + result.usage.outputTokens,
        }));
        pushEntry({ kind: "assistant", text: result.text !== "" ? result.text : acc });
      } catch (err) {
        const s = serializeError(err);
        pushEntry({ kind: "error", text: `${s.code !== "" ? s.code : s.name}: ${s.message}` });
      } finally {
        setStream("");
        setBusy(false);
        abortRef.current = null;
      }
    },
    [agentName, facade, pushEntry, sessionId],
  );

  const handleSlash = useCallback(
    (raw: string) => {
      const [cmd = "", ...rest] = raw.slice(1).trim().split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd.toLowerCase()) {
        case "help":
          pushEntry({ kind: "info", text: HELP_TEXT });
          break;
        case "agents": {
          if (arg !== "") {
            const found = agents.find((a) => a.name === arg);
            pushEntry(
              found
                ? {
                    kind: "info",
                    text: `${found.name} (${found.type}) — ${found.description}\nmodel: ${found.model ?? "(active model)"}`,
                  }
                : { kind: "error", text: `Unknown agent "${arg}"` },
            );
          } else {
            const list =
              agents.length > 0
                ? agents.map((a) => `  ${a.name} (${a.type}) — ${a.description}`).join("\n")
                : "  (no agents available)";
            pushEntry({ kind: "info", text: `Agents:\n${list}` });
          }
          break;
        }
        case "tools": {
          const tools = facade.listTools();
          const list =
            tools.length > 0
              ? tools.map((t) => `  ${t.name} [${t.category}] — ${t.description}`).join("\n")
              : "  (no tools registered)";
          pushEntry({ kind: "info", text: `Tools:\n${list}` });
          break;
        }
        case "config": {
          if (arg.trim().toLowerCase() === "show") {
            pushEntry({
              kind: "info",
              text: JSON.stringify(redactConfig(facade.config), null, 2),
            });
          } else {
            pushEntry({ kind: "error", text: "Usage: /config show" });
          }
          break;
        }
        case "theme": {
          if (arg !== "" && themes.has(arg)) {
            setThemeName(themes.get(arg).name);
            pushEntry({ kind: "info", text: `Theme switched to ${themes.get(arg).name}` });
          } else {
            pushEntry({
              kind: "error",
              text: `Unknown theme "${arg}". Available: ${themes.list().join(", ")}`,
            });
          }
          break;
        }
        case "clear":
          setEntries([]);
          setToolEvents([]);
          break;
        case "exit":
          doExit();
          break;
        default:
          pushEntry({ kind: "error", text: `Unknown command /${cmd} — try /help` });
      }
    },
    [agents, doExit, facade, pushEntry, themes],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "") return;
      setHint("");
      if (trimmed.startsWith("/")) {
        handleSlash(trimmed);
        return;
      }
      void runPrompt(text);
    },
    [handleSlash, runPrompt],
  );

  return (
    <Box flexDirection="column">
      <ChatOutput entries={entries} stream={stream} theme={theme} />
      <ToolOutput events={toolEvents} theme={theme} />
      {busy && stream === "" && <Text color={theme.dim}>… thinking (Esc to cancel)</Text>}
      {hint !== "" && <Text color={theme.warning}>{hint}</Text>}
      <ChatInput onSubmit={handleSubmit} theme={theme} disabled={busy} />
      <StatusBar
        agent={agentName}
        model={model}
        sessionId={sessionId}
        usage={usage}
        theme={theme}
        themeName={themeName}
      />
    </Box>
  );
}
