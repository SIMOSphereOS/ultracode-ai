import { describe, expect, it } from "vitest";
import { NoopLogger, ProviderError } from "ultracode-shared";
import type {
  ChangeAnalysis,
  CommitInfo,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ILLMProvider,
} from "ultracode-shared";
import { ReleasePlanningEngine } from "./ReleasePlanningEngine.js";

const logger = new NoopLogger();
const fixedNow = (): Date => new Date("2026-06-11T12:00:00.000Z");

function commit(partial: Partial<CommitInfo>): CommitInfo {
  return { hash: "abc123", type: null, scope: null, subject: "msg", breaking: false, ...partial };
}

function analysis(partial: Partial<ChangeAnalysis> = {}): ChangeAnalysis {
  return {
    files: [],
    commits: [],
    breakingChanges: [],
    categories: { feat: 0, fix: 0, docs: 0, refactor: 0, test: 0, chore: 0, perf: 0, other: 0 },
    securityFindings: [],
    ...partial,
  };
}

function fakeProvider(
  complete: (req: CompletionRequest) => Promise<CompletionResult>,
): ILLMProvider {
  return {
    name: "fake",
    listModels: async () => ["fake-model"],
    complete,
    // eslint-disable-next-line @typescript-eslint/require-await
    stream: async function* (): AsyncIterable<CompletionChunk> {
      yield { type: "done", usage: { inputTokens: 0, outputTokens: 0 } };
    },
    healthCheck: async () => true,
  };
}

const richAnalysis = analysis({
  commits: [
    commit({ type: "feat", scope: "api", subject: "feat(api): add list endpoint" }),
    commit({ type: "fix", subject: "fix: handle empty payload" }),
    commit({ type: "refactor", scope: "core", subject: "refactor(core): simplify loop" }),
    commit({ type: null, subject: "random drive-by commit" }),
  ],
  breakingChanges: [{ source: "api-diff", description: 'Exported symbol "x" was removed', location: "src/x.ts" }],
  categories: { feat: 1, fix: 1, docs: 0, refactor: 1, test: 0, chore: 0, perf: 0, other: 1 },
  securityFindings: [
    { severity: "high", rule: "secret.hardcoded-credential", file: "src/cfg.ts", line: 3, description: "credential" },
  ],
  files: [{ path: "src/x.ts", status: "modified", additions: 10, deletions: 4 }],
});

describe("ReleasePlanningEngine.plan (heuristic, no provider)", () => {
  const engine = new ReleasePlanningEngine({ logger, now: fixedNow });

  it("drafts a Keep-a-Changelog changelog with grouped sections and scope prefixes", async () => {
    const plan = await engine.plan("1.1.0", richAnalysis);
    expect(plan.version).toBe("1.1.0");
    expect(plan.changelogDraft).toContain("## [1.1.0] - 2026-06-11");
    expect(plan.changelogDraft).toContain("### Added");
    expect(plan.changelogDraft).toContain("- **api:** add list endpoint");
    expect(plan.changelogDraft).toContain("### Fixed");
    expect(plan.changelogDraft).toContain("- handle empty payload");
    expect(plan.changelogDraft).toContain("### Changed");
    expect(plan.changelogDraft).toContain("**BREAKING:**");
    expect(plan.changelogDraft).toContain("- **core:** simplify loop");
    expect(plan.changelogDraft).toContain("### Security");
    expect(plan.changelogDraft).toContain("secret.hardcoded-credential");
  });

  it("builds milestones from scopes and categories", async () => {
    const plan = await engine.plan("1.1.0", richAnalysis);
    const titles = plan.milestones.map((m) => m.title);
    expect(titles).toContain("Scope: api");
    expect(titles).toContain("Scope: core");
    expect(titles).toContain("Bug fixes");
    expect(titles).toContain("General changes");
    for (const milestone of plan.milestones) {
      expect(milestone.done).toBe(true);
      expect(milestone.items.length).toBeGreaterThan(0);
    }
  });

  it("assesses risks: breaking → high, security mapped, large diff → medium, low conv. quote → low", async () => {
    const bigFiles = [{ path: "src/big.ts", status: "modified" as const, additions: 1500, deletions: 700 }];
    const messy = analysis({
      commits: [
        commit({ type: "feat" }),
        commit({ type: null }),
        commit({ type: null }),
        commit({ type: null }),
      ],
      breakingChanges: [{ source: "commit", description: "boom" }],
      categories: { ...analysis().categories, feat: 1, other: 3 },
      securityFindings: [
        { severity: "medium", rule: "net.insecure-http", file: "src/n.ts", description: "http" },
      ],
      files: bigFiles,
    });
    const plan = await engine.plan("2.0.0", messy);
    const severities = plan.risks.map((r) => r.severity);
    expect(severities).toContain("high"); // breaking
    expect(severities).toContain("medium"); // large diff + medium finding
    expect(severities).toContain("low"); // conventional quote < 50%
    for (const risk of plan.risks) {
      expect(risk.mitigation.length).toBeGreaterThan(10);
    }
  });

  it("lists a breaking feat exactly once (deduped between Added and Changed)", async () => {
    const breakingFeat = analysis({
      commits: [
        commit({ type: "feat", breaking: true, subject: "feat!: drop legacy endpoint" }),
        commit({ type: "feat", subject: "feat: keep this one" }),
      ],
      breakingChanges: [
        { source: "commit", description: "feat!: drop legacy endpoint", location: "abc123" },
      ],
      categories: { ...analysis().categories, feat: 2 },
    });
    const plan = await engine.plan("2.0.0", breakingFeat);
    const occurrences = plan.changelogDraft.split("drop legacy endpoint").length - 1;
    expect(occurrences).toBe(1);
    // it appears under Changed/Breaking, not under Added
    expect(plan.changelogDraft).toContain("**BREAKING:** feat!: drop legacy endpoint");
    // the non-breaking feat still shows up under Added
    expect(plan.changelogDraft).toContain("- keep this one");
  });

  it("produces a minimal plan for an empty analysis", async () => {
    const plan = await engine.plan("1.0.1", analysis());
    expect(plan.changelogDraft).toContain("_No notable changes._");
    expect(plan.milestones).toHaveLength(0);
    expect(plan.risks).toHaveLength(0);
  });

  it("carries an optional target date", async () => {
    const plan = await engine.plan("1.0.1", analysis(), { targetDate: "2026-07-01T00:00:00.000Z" });
    expect(plan.targetDate).toBe("2026-07-01T00:00:00.000Z");
  });

  it("handles unicode subjects and huge analyses", async () => {
    const huge = analysis({
      commits: Array.from({ length: 2000 }, (_, i) =>
        commit({ hash: `h${i}`, type: "feat", scope: "ünïcode", subject: `feat(ünïcode): ✨ nr ${i}` }),
      ),
      categories: { ...analysis().categories, feat: 2000 },
    });
    const plan = await engine.plan("3.0.0", huge);
    expect(plan.changelogDraft).toContain("**ünïcode:** ✨ nr 0");
    expect(plan.milestones[0]?.items).toHaveLength(2000);
  });
});

describe("ReleasePlanningEngine.plan (provider polish)", () => {
  it("uses the provider-polished changelog when available", async () => {
    let received = "";
    const provider = fakeProvider(async (req) => {
      received = req.messages[1]?.content ?? "";
      return {
        text: "## [1.1.0] - polished by llm\n\n### Added\n- everything",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: "stop",
      };
    });
    const engine = new ReleasePlanningEngine({ logger, provider, now: fixedNow });
    const plan = await engine.plan("1.1.0", richAnalysis);
    expect(plan.changelogDraft).toContain("polished by llm");
    expect(received).toContain("### Added"); // the heuristic draft was sent to the provider
  });

  it("keeps the heuristic draft when the provider throws", async () => {
    const provider = fakeProvider(async () => {
      throw new ProviderError("backend down", { provider: "fake", retryable: true });
    });
    const engine = new ReleasePlanningEngine({ logger, provider, now: fixedNow });
    const plan = await engine.plan("1.1.0", richAnalysis);
    expect(plan.changelogDraft).toContain("## [1.1.0] - 2026-06-11");
    expect(plan.changelogDraft).toContain("### Added");
  });

  it("keeps the heuristic draft when the provider returns empty text", async () => {
    const provider = fakeProvider(async () => ({
      text: "   ",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 0 },
      finishReason: "stop",
    }));
    const engine = new ReleasePlanningEngine({ logger, provider, now: fixedNow });
    const plan = await engine.plan("1.1.0", richAnalysis);
    expect(plan.changelogDraft).toContain("### Added");
  });
});
