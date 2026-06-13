import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, CompletionResult, ILLMProvider, ToolDefinition } from "ultracode-shared";
import { HeuristicTokenCounter } from "./TokenCounter.js";
import type { OptimizeContext, PromptPayload } from "./types.js";
import {
  ConversationCompactionStage,
  DEDUP_PLACEHOLDER,
  DedupContextStage,
  SystemPromptMinifyStage,
  ToolSchemaSlimStage,
  WhitespaceNormalizeStage,
  omittedNote,
} from "./stages.js";

const counter = new HeuristicTokenCounter();
const baseCtx: OptimizeContext = { counter };

function payload(p: Partial<PromptPayload>): PromptPayload {
  return { system: "", tools: [], messages: [], ...p };
}

function tool(name: string, description: string, extra?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name,
    description,
    category: "utility",
    parameters: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    permission: "always",
    ...extra,
  };
}

/* -------------------------------------------------------------------------- */
/* DedupContextStage                                                          */
/* -------------------------------------------------------------------------- */

describe("DedupContextStage", () => {
  const stage = new DedupContextStage();

  it("replaces an exact-duplicate block with a reference", () => {
    const block = "file foo.ts\nconst a = 1;";
    const ctx = `${block}\n\nsomething else\n\n${block}`;
    const out = stage.apply(payload({ context: ctx }), baseCtx);
    expect(out.context).toContain(DEDUP_PLACEHOLDER);
    expect(out.context?.indexOf(block)).toBe(out.context?.lastIndexOf(block)); // only once
  });

  it("keeps the first occurrence intact", () => {
    const block = "unique content here";
    const out = stage.apply(payload({ context: `${block}\n\n${block}` }), baseCtx);
    expect(out.context?.startsWith(block)).toBe(true);
  });

  it("is a no-op when there are no duplicates (same reference)", () => {
    const p = payload({ context: "a\n\nb\n\nc" });
    expect(stage.apply(p, baseCtx)).toBe(p);
  });

  it("is idempotent", () => {
    const p = payload({ context: "dup\n\ndup\n\ndup" });
    const once = stage.apply(p, baseCtx);
    const twice = stage.apply(once, baseCtx);
    expect(twice.context).toBe(once.context);
  });

  it("handles missing/empty context", () => {
    expect(stage.apply(payload({}), baseCtx).context).toBeUndefined();
    expect(stage.apply(payload({ context: "" }), baseCtx).context).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* WhitespaceNormalizeStage                                                   */
/* -------------------------------------------------------------------------- */

describe("WhitespaceNormalizeStage", () => {
  const stage = new WhitespaceNormalizeStage();

  it("collapses 3+ blank lines to one and trims trailing whitespace", () => {
    const out = stage.apply(payload({ system: "a   \n\n\n\n\nb" }), baseCtx);
    expect(out.system).toBe("a\n\nb");
  });

  it("never touches whitespace inside fenced code blocks", () => {
    const code = "```python\ndef f():\n\n\n\n    return 1\n```";
    const out = stage.apply(payload({ system: code }), baseCtx);
    expect(out.system).toContain("def f():\n\n\n\n    return 1");
  });

  it("normalizes prose but preserves an adjacent code fence", () => {
    const text = "intro\n\n\n\n```js\nlet  x = 1;\n\n\n\n\nlet y=2;\n```\n\n\n\nouter";
    const out = stage.apply(payload({ system: text }), baseCtx);
    expect(out.system).toContain("let  x = 1;\n\n\n\n\nlet y=2;"); // code intact
    expect(out.system).toContain("intro\n\n```"); // prose collapsed
  });

  it("normalizes message content too", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "x\n\n\n\ny" }];
    const out = stage.apply(payload({ messages }), baseCtx);
    expect(out.messages[0]?.content).toBe("x\n\ny");
  });

  it("is idempotent", () => {
    const p = payload({ system: "a\n\n\n\nb\n\n\n\nc" });
    const once = stage.apply(p, baseCtx);
    const twice = stage.apply(once, baseCtx);
    expect(twice.system).toBe(once.system);
  });
});

/* -------------------------------------------------------------------------- */
/* SystemPromptMinifyStage — IMMUTABLE protection is the critical test        */
/* -------------------------------------------------------------------------- */

describe("SystemPromptMinifyStage", () => {
  it("leaves an immutable compliance block bit-for-bit unchanged", () => {
    const stage = new SystemPromptMinifyStage();
    // Note: deliberately ugly whitespace + duplicate lines INSIDE the block.
    const compliance =
      "<!--immutable-->\nAML RULE:  never   disclose  credentials.\n\n\n\nAML RULE:  never   disclose  credentials.\n<!--/immutable-->";
    const system = `Some intro.\n\n\n\nSome intro.\n\n${compliance}\n\n\n\ntrailing`;
    const out = stage.apply(payload({ system }), baseCtx);
    // The exact immutable substring must survive verbatim.
    expect(out.system).toContain(compliance);
    // But the mutable parts must have been minified (duplicate "Some intro." gone).
    expect(out.system?.match(/Some intro\./g)?.length).toBe(1);
  });

  it("protects spans matched by a custom immutableMarkers regex", () => {
    const stage = new SystemPromptMinifyStage({
      immutableMarkers: [/SECURITY-CONTRACT:[\s\S]*?END/],
    });
    const span = "SECURITY-CONTRACT:  do   not   leak.\n\n\n\nkeep  spaces  END";
    const system = `lead\n\n\n\nlead\n\n${span}`;
    const out = stage.apply(payload({ system }), baseCtx);
    expect(out.system).toContain(span);
    expect(out.system?.match(/lead/g)?.length).toBe(1);
  });

  it("protects an unterminated immutable marker to end of string", () => {
    const stage = new SystemPromptMinifyStage();
    const system = "x\n\n\n\nx\n\n<!--immutable-->\nkeep  this  \n\n\n\nexactly";
    const out = stage.apply(payload({ system }), baseCtx);
    expect(out.system).toContain("keep  this  \n\n\n\nexactly");
  });

  it("collapses blank lines and removes exact duplicate paragraphs without markers", () => {
    const stage = new SystemPromptMinifyStage();
    const system = "Be precise.\n\nBe precise.\n\n\n\nAnswer in German.";
    const out = stage.apply(payload({ system }), baseCtx);
    expect(out.system?.match(/Be precise\./g)?.length).toBe(1);
    expect(out.system).toContain("Answer in German.");
  });

  it("never semantically shortens — distinct sentences are all kept", () => {
    const stage = new SystemPromptMinifyStage();
    const system = "One.\n\nTwo.\n\nThree.";
    const out = stage.apply(payload({ system }), baseCtx);
    expect(out.system).toContain("One.");
    expect(out.system).toContain("Two.");
    expect(out.system).toContain("Three.");
  });

  it("is idempotent", () => {
    const stage = new SystemPromptMinifyStage();
    const p = payload({ system: "dup\n\ndup\n\n\n\nother" });
    const once = stage.apply(p, baseCtx);
    const twice = stage.apply(once, baseCtx);
    expect(twice.system).toBe(once.system);
  });

  it("handles empty system", () => {
    const stage = new SystemPromptMinifyStage();
    const p = payload({ system: "" });
    expect(stage.apply(p, baseCtx)).toBe(p);
  });
});

/* -------------------------------------------------------------------------- */
/* ToolSchemaSlimStage                                                        */
/* -------------------------------------------------------------------------- */

describe("ToolSchemaSlimStage", () => {
  it("shortens a long description but keeps name/parameters/required intact", () => {
    const stage = new ToolSchemaSlimStage({ maxDescriptionChars: 50 });
    const long = "word ".repeat(80);
    const original = tool("read", long);
    const out = stage.apply(payload({ tools: [original] }), baseCtx);
    const slim = out.tools[0] as ToolDefinition;
    expect(slim.name).toBe("read");
    expect(slim.parameters).toEqual(original.parameters);
    expect(slim.parameters.required).toEqual(["x"]);
    expect(slim.description.length).toBeLessThanOrEqual(51); // +1 for ellipsis
    expect(slim.description.length).toBeLessThan(long.length);
  });

  it("leaves short descriptions and short toolsets untouched (same ref)", () => {
    const stage = new ToolSchemaSlimStage({ maxDescriptionChars: 200 });
    const p = payload({ tools: [tool("a", "short")] });
    expect(stage.apply(p, baseCtx)).toBe(p);
  });

  it("keeps all tools by default (no allow-list)", () => {
    const stage = new ToolSchemaSlimStage();
    const tools = [tool("a", "x"), tool("b", "y"), tool("c", "z")];
    const out = stage.apply(payload({ tools }), baseCtx);
    expect(out.tools.map((t) => t.name)).toEqual(["a", "b", "c"]);
  });

  it("restricts to a relevantTools allow-list when provided", () => {
    const stage = new ToolSchemaSlimStage({ relevantTools: ["a", "c"] });
    const tools = [tool("a", "x"), tool("b", "y"), tool("c", "z")];
    const out = stage.apply(payload({ tools }), baseCtx);
    expect(out.tools.map((t) => t.name)).toEqual(["a", "c"]);
  });

  it("is idempotent", () => {
    const stage = new ToolSchemaSlimStage({ maxDescriptionChars: 20 });
    const p = payload({ tools: [tool("a", "word ".repeat(40))] });
    const once = stage.apply(p, baseCtx);
    const twice = stage.apply(once, baseCtx);
    expect(twice.tools[0]?.description).toBe(once.tools[0]?.description);
  });
});

/* -------------------------------------------------------------------------- */
/* ConversationCompactionStage                                                */
/* -------------------------------------------------------------------------- */

function userMsg(n: number): ChatMessage {
  return { role: "user", content: `message number ${n} with some padding text to add tokens` };
}

describe("ConversationCompactionStage", () => {
  it("is a no-op when no token budget is set", () => {
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const messages = Array.from({ length: 20 }, (_, i) => userMsg(i));
    const p = payload({ messages });
    expect(stage.apply(p, baseCtx)).toBe(p);
  });

  it("is a no-op when under budget", () => {
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const messages = [userMsg(0), userMsg(1), userMsg(2)];
    const p = payload({ messages });
    expect(stage.apply(p, { counter, tokenBudget: 1_000_000 })).toBe(p);
  });

  it("folds the middle into a note when over budget", () => {
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const messages = Array.from({ length: 30 }, (_, i) => userMsg(i));
    const out = stage.apply(payload({ messages }), { counter, tokenBudget: 10 });
    const noteIdx = out.messages.findIndex((m) => m.content.includes("omitted to save context"));
    expect(noteIdx).toBeGreaterThanOrEqual(0);
    expect(out.messages.length).toBeLessThan(messages.length);
    // First and last preserved.
    expect(out.messages[0]?.content).toBe(messages[0]?.content);
    expect(out.messages[out.messages.length - 1]?.content).toBe(messages[messages.length - 1]?.content);
  });

  it("never separates a tool-call from its tool-result pair", () => {
    // Build: head, [assistant w/ toolCall, tool result], lots of filler, tail.
    const messages: ChatMessage[] = [
      userMsg(0),
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read", arguments: {} }] },
      { role: "tool", content: "result", toolCallId: "c1" },
      ...Array.from({ length: 20 }, (_, i) => userMsg(i + 10)),
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c2", name: "read", arguments: {} }],
      },
      { role: "tool", content: "result2", toolCallId: "c2" },
    ];
    const stage = new ConversationCompactionStage({ keepHead: 2, keepTail: 2 });
    const out = stage.apply(payload({ messages }), { counter, tokenBudget: 10 });
    // Every tool result kept must have its assistant tool_call still present.
    for (let i = 0; i < out.messages.length; i++) {
      const m = out.messages[i] as ChatMessage;
      if (m.role === "tool") {
        const prev = out.messages[i - 1];
        expect(prev?.role).toBe("assistant");
        expect(prev?.toolCalls?.some((tc) => tc.id === m.toolCallId)).toBe(true);
      }
    }
  });

  it("summarizes the middle when a provider is injected (applyAsync)", async () => {
    const complete = vi.fn(
      async (): Promise<CompletionResult> => ({
        text: "- decision A\n- fact B",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
      }),
    );
    const fakeProvider = { complete } as unknown as ILLMProvider;
    const stage = new ConversationCompactionStage({
      keepHead: 1,
      keepTail: 1,
      summarizer: fakeProvider,
      summarizerModel: "fake",
    });
    const messages = Array.from({ length: 30 }, (_, i) => userMsg(i));
    const out = await stage.applyAsync(payload({ messages }), { counter, tokenBudget: 10 });
    expect(complete).toHaveBeenCalledOnce();
    expect(out.messages.some((m) => m.content.includes("decision A"))).toBe(true);
    expect(out.messages.some((m) => m.content.includes("summary of"))).toBe(true);
  });

  it("falls back to the note when the summarizer throws (applyAsync)", async () => {
    const fakeProvider = {
      complete: vi.fn(async () => {
        throw new Error("boom");
      }),
    } as unknown as ILLMProvider;
    const stage = new ConversationCompactionStage({
      keepHead: 1,
      keepTail: 1,
      summarizer: fakeProvider,
      summarizerModel: "fake",
    });
    const messages = Array.from({ length: 30 }, (_, i) => userMsg(i));
    const out = await stage.applyAsync(payload({ messages }), { counter, tokenBudget: 10 });
    expect(out.messages.some((m) => m.content.includes("omitted to save context"))).toBe(true);
  });

  it("converges (re-applying does nothing more)", () => {
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const messages = Array.from({ length: 30 }, (_, i) => userMsg(i));
    const once = stage.apply(payload({ messages }), { counter, tokenBudget: 10 });
    const twice = stage.apply(once, { counter, tokenBudget: 10 });
    expect(twice.messages.length).toBe(once.messages.length);
  });
});

describe("ConversationCompactionStage with tools present", () => {
  it("counts tool tokens in the budget decision and still compacts", () => {
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const messages = Array.from({ length: 20 }, (_, i) => userMsg(i));
    const tools = [tool("read", "reads a file"), tool("write", "writes a file")];
    const out = stage.apply(payload({ messages, tools }), { counter, tokenBudget: 10 });
    expect(out.messages.length).toBeLessThan(messages.length);
    expect(out.messages.some((m) => m.content.includes("omitted to save context"))).toBe(true);
  });

  it("snaps the head boundary forward past an assistant tool-call pair", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "h1", name: "read", arguments: {} }] },
      { role: "tool", content: "head-result", toolCallId: "h1" },
      ...Array.from({ length: 20 }, (_, i) => userMsg(i + 5)),
    ];
    const stage = new ConversationCompactionStage({ keepHead: 1, keepTail: 1 });
    const out = stage.apply(payload({ messages }), { counter, tokenBudget: 10 });
    // The tool result for the head assistant call must stay adjacent to it.
    const toolIdx = out.messages.findIndex((m) => m.content === "head-result");
    expect(toolIdx).toBeGreaterThan(0);
    expect(out.messages[toolIdx - 1]?.role).toBe("assistant");
  });
});

describe("omittedNote", () => {
  it("uses singular/plural correctly", () => {
    expect(omittedNote(1)).toContain("1 earlier message ");
    expect(omittedNote(3)).toContain("3 earlier messages");
  });
});
