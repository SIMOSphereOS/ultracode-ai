import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { dark } from "../themes/index.js";
import { ChatInput } from "./ChatInput.js";
import { ChatOutput, type ChatEntry } from "./ChatOutput.js";
import { StatusBar, shortSessionId } from "./StatusBar.js";
import { ToolOutput } from "./ToolOutput.js";

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const ENTER = "\r";
const CTRL_J = "\n";
const UP = "\u001B[A";
const DOWN = "\u001B[B";
const BACKSPACE = "\u007F";

describe("ChatInput", () => {
  it("renders typed characters and submits on Enter", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<ChatInput onSubmit={onSubmit} theme={dark} />);
    await tick();
    stdin.write("hello 🌍");
    await tick();
    expect(lastFrame()).toContain("hello 🌍");
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("hello 🌍");
    expect(lastFrame()).not.toContain("hello 🌍"); // cleared after submit
  });

  it("ignores empty / whitespace-only submissions", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<ChatInput onSubmit={onSubmit} theme={dark} />);
    await tick();
    stdin.write(ENTER);
    stdin.write("   ");
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("recalls history with Up/Down arrows and resubmits", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<ChatInput onSubmit={onSubmit} theme={dark} />);
    await tick();
    stdin.write("one");
    stdin.write(ENTER);
    await tick();
    stdin.write("two");
    stdin.write(ENTER);
    await tick();

    stdin.write(UP);
    await tick();
    expect(lastFrame()).toContain("two");
    stdin.write(UP);
    await tick();
    expect(lastFrame()).toContain("one");
    stdin.write(DOWN);
    await tick();
    expect(lastFrame()).toContain("two");

    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenLastCalledWith("two");
  });

  it("inserts a newline on Ctrl+J and submits the multiline value", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<ChatInput onSubmit={onSubmit} theme={dark} />);
    await tick();
    stdin.write("ab");
    stdin.write(CTRL_J);
    stdin.write("cd");
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("❯ ab");
    expect(frame).toContain("… cd");
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("ab\ncd");
  });

  it("backspace removes the last character without splitting emoji", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(<ChatInput onSubmit={onSubmit} theme={dark} />);
    await tick();
    stdin.write("a🚀");
    await tick();
    stdin.write(BACKSPACE);
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("❯ a");
    expect(frame).not.toContain("🚀");
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("a");
  });

  it("shows the placeholder when empty and ignores input when disabled", async () => {
    const onSubmit = vi.fn();
    const { stdin, lastFrame } = render(
      <ChatInput onSubmit={onSubmit} theme={dark} disabled placeholder="say something" />,
    );
    await tick();
    expect(lastFrame()).toContain("(thinking — press Esc to cancel)");
    stdin.write("nope");
    stdin.write(ENTER);
    await tick();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ChatOutput", () => {
  it("renders user, assistant, info and error entries", () => {
    const entries: ChatEntry[] = [
      { kind: "user", text: "question?" },
      { kind: "assistant", text: "answer!" },
      { kind: "info", text: "fyi" },
      { kind: "error", text: "AGENT_ERROR: nope" },
    ];
    const { lastFrame } = render(<ChatOutput entries={entries} stream="" theme={dark} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("› question?");
    expect(frame).toContain("answer!");
    expect(frame).toContain("fyi");
    expect(frame).toContain("AGENT_ERROR: nope");
  });

  it("renders the live stream with a cursor", () => {
    const { lastFrame } = render(<ChatOutput entries={[]} stream="strea" theme={dark} />);
    expect(lastFrame()).toContain("strea");
    expect(lastFrame()).toContain("▋");
  });

  it("truncates gigantic entries instead of flooding the terminal", () => {
    const entries: ChatEntry[] = [{ kind: "assistant", text: "y".repeat(1_100_000) }];
    const { lastFrame } = render(<ChatOutput entries={entries} stream="" theme={dark} />);
    expect((lastFrame() ?? "").length).toBeLessThan(50_000);
  });
});

describe("ToolOutput", () => {
  it("renders nothing for an empty event list", () => {
    const { lastFrame } = render(<ToolOutput events={[]} theme={dark} />);
    expect((lastFrame() ?? "").trim()).toBe("");
  });

  it("renders ✓/✗ with durations and caps at max entries", () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      toolName: `tool${i}`,
      ok: i % 2 === 0,
      durationMs: i * 10.4,
    }));
    const { lastFrame } = render(<ToolOutput events={events} theme={dark} max={5} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("tool2"); // only the last five remain
    expect(frame).toContain("✗ tool3");
    expect(frame).toContain("✓ tool4");
    expect(frame).toContain("(31ms)");
  });
});

describe("StatusBar", () => {
  it("renders agent, model, session, tokens and theme", () => {
    const { lastFrame } = render(
      <StatusBar
        agent="build"
        model="mistral-large"
        sessionId="sess_0123456789abcdef"
        usage={{ input: 1234, output: 56 }}
        theme={dark}
        themeName="dark"
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("build");
    expect(frame).toContain("mistral-large");
    expect(frame).toContain("session:sess_012");
    expect(frame).toContain("tokens 1234/56");
    expect(frame).toContain("theme:dark");
  });

  it("shows 'new' while no session exists", () => {
    const { lastFrame } = render(
      <StatusBar
        agent="default"
        model="m"
        usage={{ input: 0, output: 0 }}
        theme={dark}
        themeName="dark"
      />,
    );
    expect(lastFrame()).toContain("session:new");
  });
});

describe("shortSessionId", () => {
  it("shortens long ids and handles empty/unicode ids", () => {
    expect(shortSessionId("0123456789")).toBe("01234567");
    expect(shortSessionId(undefined)).toBe("new");
    expect(shortSessionId("")).toBe("new");
    expect(shortSessionId("🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀")).toBe("🚀🚀🚀🚀🚀🚀🚀🚀");
  });
});
