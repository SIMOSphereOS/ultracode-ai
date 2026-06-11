/**
 * Conventional-Commit parsing shared by the Change Analysis and Release
 * Planning engines.
 *
 * Parsing is tolerant: messages that do not follow the
 * `type(scope)!: subject` convention yield `type: null` instead of failing.
 */

/** Parsed pieces of a conventional commit subject line. */
export interface ParsedConventionalSubject {
  /** Lower-cased conventional type (e.g. `"feat"`), or `null` when unparseable. */
  type: string | null;
  /** Conventional scope, or `null` when absent. */
  scope: string | null;
  /** Description part after the `type(scope):` prefix; the full subject when unparseable. */
  description: string;
  /** Whether the subject carries the breaking-change marker (`!`). */
  breakingMarker: boolean;
}

/** Matches `type(scope)!: description` subjects (scope and `!` optional). */
const CONVENTIONAL_SUBJECT_RE = /^([A-Za-z]+)(?:\(([^()]*)\))?(!)?:\s+(.+)$/;

/** Matches a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer in a commit body. */
const BREAKING_FOOTER_RE = /(^|\r?\n)\s*BREAKING[ -]CHANGE\s*:/;

/**
 * Parses a commit subject line according to the Conventional Commits spec.
 * Never throws; non-conventional subjects produce `type: null` with the full
 * subject as description.
 */
export function parseConventionalSubject(subject: string): ParsedConventionalSubject {
  const match = CONVENTIONAL_SUBJECT_RE.exec(subject);
  if (!match) {
    return { type: null, scope: null, description: subject, breakingMarker: false };
  }
  const scope = match[2]?.trim();
  return {
    type: (match[1] ?? "").toLowerCase(),
    scope: scope ? scope : null,
    description: match[4] ?? subject,
    breakingMarker: match[3] === "!",
  };
}

/** Whether a commit body declares a breaking change via footer. */
export function hasBreakingFooter(body: string): boolean {
  return BREAKING_FOOTER_RE.test(body);
}
