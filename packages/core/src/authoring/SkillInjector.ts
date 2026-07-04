/**
 * {@link createSkillInjector} — make `status: "active"` skills take effect at
 * runtime by injecting their bodies into an agent's prompt context.
 *
 * The injector is a {@link ContextCollector}: given the user's prompt it loads
 * the skill registry, keeps only active skills, scores each by how many of its
 * triggers appear (case-insensitively) as tokens in the prompt, and concatenates
 * the highest-scoring skills' bodies (up to `maxSkills` / `maxChars`) into a
 * clearly-marked context block. Skills contribute **context only** — they never
 * alter tool permissions. With no matching active skill it returns `""` and any
 * failure is swallowed to `""`, so the agent's behaviour is exactly unchanged.
 */

import type { Logger } from "ultracode-shared";
import { NoopLogger, serializeError } from "ultracode-shared";

import type { ContextCollector } from "../agents/BaseAgent.js";
import {
  CLIP_MIN_BUDGET_FRACTION,
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_SKILLS,
  SKILL_CONTEXT_HEADER,
} from "./defaults.js";
import type { SkillRegistry } from "./SkillRegistry.js";
import { findForbiddenPhrases } from "./safety.js";
import type { Skill } from "./types.js";

export { DEFAULT_MAX_CHARS, DEFAULT_MAX_SKILLS, SKILL_CONTEXT_HEADER };

/** Options for {@link createSkillInjector}. */
export interface SkillInjectorOptions {
  /** Maximum number of skills to inject (default {@link DEFAULT_MAX_SKILLS}). */
  maxSkills?: number;
  /** Maximum total characters of skill body to inject (default {@link DEFAULT_MAX_CHARS}). */
  maxChars?: number;
  /** Logger for non-fatal warnings (defaults to a no-op). */
  logger?: Logger;
  /**
   * Additional skills merged with those from the registry before scoring, e.g.
   * project-local skills loaded from `<cwd>/.ultracode/skills`. On a name
   * collision an `extraSkills` entry wins over the registry's (project takes
   * precedence over the home store). Defaults to none — omitting it leaves the
   * injector's behaviour exactly as before.
   */
  extraSkills?: readonly Skill[];
}

/** A scored, active skill candidate. */
interface ScoredSkill {
  skill: Skill;
  score: number;
}

/**
 * Build a {@link ContextCollector} that injects matching active skills.
 *
 * @param registry - The authoring {@link SkillRegistry} to read skills from.
 * @param opts - Optional caps and logger.
 * @returns A `(prompt) => Promise<string>` collector. Returns `""` when no
 *   active skill matches, on a corrupt registry, or on any failure.
 */
export function createSkillInjector(
  registry: SkillRegistry,
  opts: SkillInjectorOptions = {},
): ContextCollector {
  const maxSkills =
    Number.isInteger(opts.maxSkills) && (opts.maxSkills as number) > 0
      ? (opts.maxSkills as number)
      : DEFAULT_MAX_SKILLS;
  const maxChars =
    Number.isInteger(opts.maxChars) && (opts.maxChars as number) > 0
      ? (opts.maxChars as number)
      : DEFAULT_MAX_CHARS;
  const logger = opts.logger ?? new NoopLogger();
  const extraSkills = opts.extraSkills ?? [];

  return async (prompt: string): Promise<string> => {
    try {
      const all = mergeByName(await registry.load(), extraSkills);
      const active = all.filter((s) => s.status === "active");
      if (active.length === 0) return "";

      const promptTokens = tokenize(prompt);
      if (promptTokens.size === 0) return "";

      const scored: ScoredSkill[] = [];
      for (const skill of active) {
        const score = triggerScore(skill, promptTokens);
        if (score > 0) scored.push({ skill, score });
      }
      if (scored.length === 0) return "";

      // Rank by score desc, then by name asc for a stable, deterministic tie-break.
      scored.sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.skill.name.localeCompare(b.skill.name),
      );

      // Re-screen each skill body for forbidden phrases before injection.
      // `~/.ultracode/skills` is untrusted on-disk input: a body may have been
      // hand-edited or written by an untrusted learn run after it passed the
      // author's safety gate, so we never inject an unscreened body into LLM
      // context. A failing body is skipped (not injected) and logged.
      const safe: ScoredSkill[] = [];
      for (const candidate of scored) {
        const hits = findForbiddenPhrases(candidate.skill.body ?? "");
        if (hits.length > 0) {
          logger.warn("skill-injector.skipped-unsafe", {
            skill: candidate.skill.name,
            phrases: hits,
          });
          continue;
        }
        safe.push(candidate);
      }
      if (safe.length === 0) return "";

      const top = safe.slice(0, maxSkills);
      return assembleBlock(top, maxChars);
    } catch (err) {
      logger.warn("skill-injector.failed", { error: serializeError(err) });
      return "";
    }
  };
}

/**
 * Merge registry skills with `extra` skills, keyed by name. An `extra` entry
 * with the same name replaces the registry entry (project precedence over the
 * home store). When `extra` is empty the registry array is returned untouched so
 * the common case allocates nothing and preserves the previous behaviour exactly.
 */
function mergeByName(base: readonly Skill[], extra: readonly Skill[]): Skill[] {
  if (extra.length === 0) return base as Skill[];
  const byName = new Map<string, Skill>();
  for (const skill of base) byName.set(skill.name, skill);
  for (const skill of extra) byName.set(skill.name, skill);
  return [...byName.values()];
}

/**
 * Score a skill by the number of its triggers that appear as case-insensitive
 * tokens in the prompt. Multi-word triggers match only when *every* word is
 * present in the prompt token set.
 */
function triggerScore(skill: Skill, promptTokens: ReadonlySet<string>): number {
  let score = 0;
  for (const trigger of skill.triggers ?? []) {
    const words = tokenizeArray(trigger);
    if (words.length === 0) continue;
    if (words.every((w) => promptTokens.has(w))) score++;
  }
  return score;
}

/** Concatenate the top skills' bodies into a marked context block under `maxChars`. */
function assembleBlock(top: ScoredSkill[], maxChars: number): string {
  const parts: string[] = [SKILL_CONTEXT_HEADER];
  let used = SKILL_CONTEXT_HEADER.length;

  for (const { skill } of top) {
    const heading = `\n\n### ${skill.name}\n`;
    const body = (skill.body ?? "").trim();
    if (body.length === 0) continue;

    const remaining = maxChars - used - heading.length;
    if (remaining <= 0) break;

    const clipped = body.length > remaining ? clipAtWordBoundary(body, remaining) : body;
    if (clipped.length === 0) break;

    parts.push(`${heading}${clipped}`);
    used += heading.length + clipped.length;
    if (used >= maxChars) break;
  }

  // Only a header and nothing else → nothing useful to inject.
  return parts.length > 1 ? parts.join("") : "";
}

/** Clip text to at most `max` chars, preferring the last whitespace boundary. */
function clipAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.search(/\s\S*$/);
  // Keep at least ~60% of the budget even if there is no late whitespace.
  if (lastSpace > max * CLIP_MIN_BUDGET_FRACTION) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

/** Tokenize a string into a lower-cased set of word tokens (Unicode-aware). */
function tokenize(text: string): Set<string> {
  return new Set(tokenizeArray(text));
}

/** Tokenize into a lower-cased array of word tokens (Unicode letters/digits). */
function tokenizeArray(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const lowered = text.toLowerCase();
  // Split on anything that is not a Unicode letter, number or underscore.
  const matches = lowered.match(/[\p{L}\p{N}_]+/gu);
  return matches ?? [];
}
