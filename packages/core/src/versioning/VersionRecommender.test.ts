import type { ChangeAnalysis, CommitInfo, VersioningConfig } from "ultracode-shared";
import { DEFAULT_CONFIG, VersioningError } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { VersionRecommender } from "./VersionRecommender.js";

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

const recommender = new VersionRecommender();

describe("VersionRecommender.suggest", () => {
  it("suggests a major bump for breaking changes on 1.x", () => {
    const result = recommender.suggest(
      analysis({
        commits: [commit({ type: "feat", subject: "feat!: drop", breaking: true })],
        breakingChanges: [{ source: "commit", description: "feat!: drop" }],
        categories: { ...analysis().categories, feat: 1 },
      }),
      "1.2.3",
    );
    expect(result.bump).toBe("major");
    expect(result.suggestedVersion).toBe("2.0.0");
    expect(result.reasons.join(" ")).toMatch(/breaking/i);
  });

  it("maps breaking changes on 0.x to a minor bump (SemVer convention)", () => {
    const result = recommender.suggest(
      analysis({
        commits: [commit({ type: "feat", breaking: true })],
        breakingChanges: [{ source: "commit", description: "x" }],
        categories: { ...analysis().categories, feat: 1 },
      }),
      "0.5.2",
    );
    expect(result.bump).toBe("minor");
    expect(result.suggestedVersion).toBe("0.6.0");
    expect(result.reasons.join(" ")).toMatch(/0\.x|pre-1\.0/i);
  });

  it("suggests minor for features and patch for fixes/perf/refactor", () => {
    const feat = recommender.suggest(
      analysis({
        commits: [commit({ type: "feat" })],
        categories: { ...analysis().categories, feat: 1 },
      }),
      "1.0.0",
    );
    expect(feat).toMatchObject({ bump: "minor", suggestedVersion: "1.1.0" });

    const fix = recommender.suggest(
      analysis({
        commits: [commit({ type: "fix" }), commit({ type: "perf" })],
        categories: { ...analysis().categories, fix: 1, perf: 1 },
      }),
      "1.0.0",
    );
    expect(fix).toMatchObject({ bump: "patch", suggestedVersion: "1.0.1" });
  });

  it("suggests none for docs-only changes without code impact", () => {
    const result = recommender.suggest(
      analysis({
        commits: [commit({ type: "docs" })],
        categories: { ...analysis().categories, docs: 1 },
        files: [{ path: "docs/guide.md", status: "modified", additions: 5, deletions: 1 }],
      }),
      "1.4.0",
    );
    expect(result.bump).toBe("none");
    expect(result.suggestedVersion).toBe("1.4.0");
  });

  it("suggests a cautious low-confidence patch when docs/chore commits touch code", () => {
    const result = recommender.suggest(
      analysis({
        commits: [commit({ type: "chore" })],
        categories: { ...analysis().categories, chore: 1 },
        files: [{ path: "src/core.ts", status: "modified", additions: 3, deletions: 1 }],
      }),
      "1.4.0",
    );
    expect(result.bump).toBe("patch");
    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });

  it("suggests none for a completely empty analysis", () => {
    const result = recommender.suggest(analysis(), "2.0.0");
    expect(result.bump).toBe("none");
    expect(result.suggestedVersion).toBe("2.0.0");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("supports prerelease bumps with an identifier", () => {
    const base = analysis({
      commits: [commit({ type: "feat" })],
      categories: { ...analysis().categories, feat: 1 },
    });
    const alpha = recommender.suggest(base, "1.0.0", { prerelease: "alpha" });
    expect(alpha.bump).toBe("prerelease");
    expect(alpha.suggestedVersion).toBe("1.1.0-alpha.0");

    const next = recommender.suggest(base, "1.1.0-alpha.0", { prerelease: "alpha" });
    expect(next.suggestedVersion).toBe("1.1.0-alpha.1");

    const rc = recommender.suggest(
      analysis({
        commits: [commit({ type: "fix" })],
        categories: { ...analysis().categories, fix: 1 },
      }),
      "2.3.4",
      { prerelease: "rc" },
    );
    expect(rc.suggestedVersion).toBe("2.3.5-rc.0");
  });

  it("accepts a leading v prefix and rejects invalid versions", () => {
    const result = recommender.suggest(
      analysis({
        commits: [commit({ type: "fix" })],
        categories: { ...analysis().categories, fix: 1 },
      }),
      "v1.0.0",
    );
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.suggestedVersion).toBe("1.0.1");

    expect(() => recommender.suggest(analysis(), "not-a-version")).toThrow(VersioningError);
    expect(() => recommender.suggest(analysis(), "")).toThrow(VersioningError);
    expect(() => recommender.suggest(analysis(), "1.2.3.4.5 🚀")).toThrow(VersioningError);
  });

  it("raises confidence with the share of conventional commits", () => {
    const allConventional = recommender.suggest(
      analysis({
        commits: [commit({ type: "feat" }), commit({ type: "fix" })],
        categories: { ...analysis().categories, feat: 1, fix: 1 },
      }),
      "1.0.0",
    );
    const mixed = recommender.suggest(
      analysis({
        commits: [commit({ type: "feat" }), commit({ type: null }), commit({ type: null })],
        categories: { ...analysis().categories, feat: 1, other: 2 },
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      }),
      "1.0.0",
    );
    expect(allConventional.confidence).toBeGreaterThan(mixed.confidence);
    expect(allConventional.confidence).toBeLessThanOrEqual(1);
    expect(mixed.confidence).toBeGreaterThanOrEqual(0);
  });

  it("handles huge analyses without slowing to a crawl", () => {
    const commits = Array.from({ length: 5000 }, (_, i) =>
      commit({
        hash: `h${i}`,
        type: i % 2 === 0 ? "feat" : null,
        subject: `c${i} ${"y".repeat(200)}`,
      }),
    );
    const result = recommender.suggest(
      analysis({
        commits,
        categories: { ...analysis().categories, feat: 2500, other: 2500 },
      }),
      "1.0.0",
    );
    expect(result.bump).toBe("minor");
  });
});

describe("VersionRecommender.resolveChannelVersion", () => {
  const config: VersioningConfig = {
    ...DEFAULT_CONFIG.versioning,
    channels: { stable: "1.2.3", lts: "1.0.9", experimental: "2.0.0-rc.1" },
  };

  it("resolves known channels", () => {
    const withConfig = new VersionRecommender({ config });
    expect(withConfig.resolveChannelVersion()).toBe("1.2.3");
    expect(withConfig.resolveChannelVersion("lts")).toBe("1.0.9");
    expect(withConfig.resolveChannelVersion("experimental")).toBe("2.0.0-rc.1");
  });

  it("throws VersioningError for unknown channels or missing config", () => {
    const withConfig = new VersionRecommender({ config });
    expect(() => withConfig.resolveChannelVersion("nightly")).toThrow(VersioningError);
    const withoutConfig = new VersionRecommender();
    expect(() => withoutConfig.resolveChannelVersion("stable")).toThrow(VersioningError);
  });
});
