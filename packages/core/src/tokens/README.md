# `@ultracode/core/tokens` — Token Optimization

Deterministic, **ML-free**, offline token optimization for LLM prompts. The
module measures the *actual* before/after token counts of a prompt and reports
the **real** reduction — it never claims a saving it did not make.

> **Honesty first.** The headline figure people quote — *"up to ~80 % fewer
> tokens"* — is achievable **only** on redundant, multi-turn workloads, and the
> bulk of it comes from **provider prompt-caching**, not from text shaving. On a
> single fresh prompt the realistic reduction from the heuristic stages is
> **single-digit to ~20 %**. This module is built so you can see the true number
> for *your* workload, not a marketing one.

## Architecture

A prompt is modelled as a [`PromptPayload`](./types.ts):

```
system   — persona / instructions (mostly static)
tools    — tool schemas (static)
messages — conversation history (variable)
context? — injected project/file context (semi-static)
```

A [`TokenCounter`](./TokenCounter.ts) turns any of those into a token estimate.
The default `HeuristicTokenCounter` is offline and deterministic (no `tiktoken`,
no model downloads). A chain of pure, deterministic
[`OptimizerStage`](./types.ts)s is run by the
[`TokenOptimizer`](./TokenOptimizer.ts), which measures tokens **before and
after every stage** and returns honest per-stage and total savings.

```
TokenOptimizer.optimize(payload, { counter, prompt?, tokenBudget? })
  → { payload, before, after, reductionPct, perStage }
```

`createDefaultOptimizer()` wires the recommended safe chain.

## What each stage saves (and how much, honestly)

| Stage | What it does | Realistic saving | Lossy? |
|---|---|---|---|
| `DedupContextStage` | Replaces byte-identical context blocks (same file read twice) with `[identical to block above]` | **High on duplicated context** (a re-read file is ~100 % of its second copy), ~0 % otherwise | No — refers to the kept original |
| `WhitespaceNormalizeStage` | Collapses 3+ blank lines, trims line ends — **never inside fenced code** | Low, **1–5 %** typically | No |
| `SystemPromptMinifyStage` | Collapses blank lines + removes **exact-duplicate paragraphs** in the system prompt | Low, depends on prompt hygiene | No (lossless only) |
| `ToolSchemaSlimStage` | Shortens over-long tool **descriptions** to a max length; optional per-turn tool allow-list | Low–medium with many verbose tools; high if you drop irrelevant tools | Description text only |
| `ConversationCompactionStage` | Head/tail sliding window; folds the middle into a note (or an LLM summary) **only when over budget** | **High on long histories** — this is the big lever for long sessions | Yes (by design, over budget only) |
| **Provider prompt-caching** | Marks the stable `system + tools` prefix as cacheable (`cache_control` / `prompt_cache_key`) | **The largest *cost* lever** — cached prefix reads bill at a fraction of fresh input tokens | No (changes billing, not content) |

The "~80 %" number is the combination of **caching a large stable prefix** +
**context selection/compaction** across a redundant workload. It is
workload- and provider-dependent and **never guaranteed**.

## What is NEVER compressed

These are hard invariants enforced by the stages and covered by tests:

- **Security / compliance / AML instructions.** `SystemPromptMinifyStage`
  reproduces any span wrapped in immutable markers
  (`<!--immutable-->…<!--/immutable-->`, or a supplied `immutableMarkers`
  regex) **bit-for-bit**. Without markers it does *only* lossless
  whitespace/exact-duplicate reduction — never semantic shortening or
  paraphrasing.
- **Code logic.** Fenced code blocks (```` ``` ````/`~~~`) are never reflowed —
  significant whitespace (Python, YAML, diffs) is preserved exactly.
- **Tool schemas.** Tool `name`, `parameters` and `required` are never touched;
  only free-text descriptions are trimmed. A tool call can never break.
- **Tool-call/result pairing.** Compaction never separates an assistant tool
  call from its `tool` result.

## Token counting is an estimate

`HeuristicTokenCounter` blends a chars/4 model with a word×1.3 model and adds
surcharges for punctuation and CJK/emoji codepoints. It is **deterministic,
monotonic and total** (safe on empty, ≥1 MB, Unicode, emoji, surrogate and
pure-whitespace inputs), but the absolute count carries a **provider-dependent
±10–20 % band** (real BPE/SentencePiece tokenizers disagree). It is ideal for
*relative* before/after reporting and budgeting. For an exact count, plug a
`ProviderTokenCounter` (e.g. a future Anthropic `count_tokens` call) — but the
default is deliberately offline.

## Provider caching rule

> **Static first, variable last; put the cache breakpoint on the last stable
> block.**

The stable prefix is `system + tools` (+ early, stable context); the variable
suffix is the message history. `cachePrefixHint(payload)` produces a
[`CacheHint`](./types.ts) with a stable key derived only from the prefix.

- **Anthropic**: sets `cache_control: { type: "ephemeral" }` on the **last**
  stable block (last tool if present, else the system block) — one of the max 4
  breakpoints.
- **OpenAI / Mistral**: sets a stable `prompt_cache_key` (OpenAI caches prefixes
  ≥ 1024 tokens automatically; a stable key + stable ordering maximises hits).

**Default off.** With no hint, every provider emits its exact pre-existing wire
format, so existing behaviour and tests are unchanged.

## Integration

`ExecutionEngine` accepts an optional `optimizer` (an `ITokenOptimizer`),
`enableTokenOptimization` (default `true`, but a no-op unless an optimizer is
injected) and a `tokenBudget`. When enabled it optimizes the prompt **before**
the first provider call, writes the result back, and publishes a core-local
`tokens.optimized` event (`{ before, after, reductionPct, perStage }`) on the
event bus, falling back to `logger.info`. Optimizer failures are caught and the
original prompt is used unchanged.

```ts
const engine = new ExecutionEngine({
  provider, tools, model,
  optimizer: createDefaultOptimizer({ immutableMarkers: [/SECURITY-CONTRACT[\s\S]*?END/] }),
  tokenBudget: 8_000,
});
```
