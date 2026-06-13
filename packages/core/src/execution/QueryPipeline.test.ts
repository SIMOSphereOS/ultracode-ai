import { describe, expect, it, vi } from "vitest";
import { AgentError, ProviderError, ValidationError } from "ultracode-shared";
import type { AgentRunResult } from "ultracode-shared";
import { QueryPipeline } from "./QueryPipeline.js";
import type { ParsedQuery } from "./QueryPipeline.js";

const runResult = (text: string): AgentRunResult => ({
  text,
  toolCallsExecuted: 0,
  usage: { inputTokens: 1, outputTokens: 1 },
  turns: 1,
});

const pipeline = (execute = vi.fn(async () => runResult("ok")), maxPromptLength?: number) =>
  new QueryPipeline(
    maxPromptLength === undefined ? { execute } : { execute, maxPromptLength },
  );

describe("QueryPipeline.parse", () => {
  it("trims and normalises CRLF/CR line endings", () => {
    const q = pipeline().parse("  hello\r\nworld\rfoo  ");
    expect(q.prompt).toBe("hello\nworld\nfoo");
    expect(q.raw).toBe("  hello\r\nworld\rfoo  ");
    expect(q.agent).toBeUndefined();
  });

  it("extracts a leading @agent mention", () => {
    const q = pipeline().parse("@review please check this diff");
    expect(q.agent).toBe("review");
    expect(q.prompt).toBe("please check this diff");
  });

  it("does not treat a lone @mention without prompt as an agent", () => {
    const q = pipeline().parse("@review");
    expect(q.agent).toBeUndefined();
    expect(q.prompt).toBe("@review");
  });

  it("throws ValidationError for non-string input", () => {
    for (const bad of [null, undefined, 42, {}, ["x"], Symbol("x")]) {
      expect(() => pipeline().parse(bad)).toThrowError(ValidationError);
    }
  });

  it("preserves unicode, emoji and surrogate pairs", () => {
    const text = "Grüße 👩‍👩‍👧‍👦 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 \u{1F600}";
    expect(pipeline().parse(text).prompt).toBe(text);
  });

  it("handles huge inputs (>= 1 MB)", () => {
    const huge = "y".repeat(1_500_000);
    expect(pipeline().parse(huge).prompt).toHaveLength(1_500_000);
  });
});

describe("QueryPipeline.validate", () => {
  it("rejects empty prompts", () => {
    const p = pipeline();
    expect(() => p.validate(p.parse("   \r\n  "))).toThrowError(ValidationError);
  });

  it("rejects prompts above maxPromptLength", () => {
    const p = pipeline(undefined, 10);
    expect(() => p.validate(p.parse("01234567890"))).toThrowError(ValidationError);
    expect(p.validate(p.parse("0123456789")).prompt).toBe("0123456789");
  });

  it("ignores non-positive/invalid maxPromptLength values", () => {
    const p = pipeline(undefined, Number.NaN);
    expect(p.validate(p.parse("anything goes")).prompt).toBe("anything goes");
  });
});

describe("QueryPipeline.execute", () => {
  it("delegates to the injected executor", async () => {
    const execute = vi.fn(async (q: ParsedQuery) => runResult(`ran:${q.prompt}`));
    const result = await pipeline(execute).execute({ prompt: "p", raw: "p" });
    expect(result.text).toBe("ran:p");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("wraps unknown executor failures in AgentError (cause preserved)", async () => {
    const boom = new Error("kaboom");
    const p = pipeline(
      vi.fn(async () => {
        throw boom;
      }),
    );
    const err = await p.execute({ prompt: "p", raw: "p" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect((err as AgentError).cause).toBe(boom);
  });

  it("passes UltraCode errors through unchanged", async () => {
    const original = new ProviderError("no key", { provider: "fake" });
    const p = pipeline(
      vi.fn(async () => {
        throw original;
      }),
    );
    await expect(p.execute({ prompt: "p", raw: "p" })).rejects.toBe(original);
  });

  it("passes abort-derived errors through unchanged", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const p = pipeline(
      vi.fn(async () => {
        throw abortErr;
      }),
    );
    await expect(p.execute({ prompt: "p", raw: "p" })).rejects.toBe(abortErr);
  });
});

describe("QueryPipeline.format / run", () => {
  it("formats results, falling back for empty text", () => {
    const p = pipeline();
    expect(p.format(runResult("  answer \n"))).toBe("answer");
    expect(p.format(runResult("   "))).toBe("(no output)");
  });

  it("runs all stages end to end", async () => {
    const execute = vi.fn(async (q: ParsedQuery) => runResult(`agent=${q.agent ?? "-"}`));
    const out = await pipeline(execute).run("@plan analyse the repo\r\n");
    expect(out.query.agent).toBe("plan");
    expect(out.query.prompt).toBe("analyse the repo");
    expect(out.formatted).toBe("agent=plan");
  });
});
