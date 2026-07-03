/**
 * Static security rule engine for the Change Analysis Engine.
 *
 * Each rule is a line-based regex with a severity and a stable rule id.
 * Findings in test files (`*.test.*`, `*.spec.*`, `__tests__/`) are dampened
 * by one severity step to reduce false positives.
 */

import type { SecurityFinding } from "ultracode-shared";

/** Severity levels, re-exported for convenience. */
export type SecuritySeverity = SecurityFinding["severity"];

/** A single static-analysis rule. */
export interface SecurityRule {
  /** Stable rule identifier (e.g. `"secret.aws-access-key-id"`). */
  id: string;
  /** Base severity before any dampening. */
  severity: SecuritySeverity;
  /** Human-readable description of what the rule detects. */
  description: string;
  /** Line-based pattern (must not use the `g` flag). */
  pattern: RegExp;
}

/** Built-in security rules applied to every analysed file. */
export const SECURITY_RULES: readonly SecurityRule[] = [
  {
    id: "secret.aws-access-key-id",
    severity: "critical",
    description: "Hardcoded AWS access key id (AKIA…) detected",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: "secret.private-key",
    severity: "critical",
    description: "PEM private key block embedded in source",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  {
    id: "secret.hardcoded-credential",
    severity: "high",
    description: "Hardcoded credential assignment (api key / token / password) with literal value",
    pattern:
      /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd)\b\s*[:=]+\s*["'`][^"'`]{4,}["'`]/i,
  },
  {
    id: "code.dynamic-eval",
    severity: "high",
    description: "Dynamic code execution via eval() or new Function()",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    id: "code.child-process-concat",
    severity: "high",
    description: "child_process call built from string concatenation or interpolation",
    pattern:
      /\b(?:execSync|exec|spawnSync|spawn|execFileSync|execFile)\s*\(\s*(?:[^,)]*\+|`[^`]*\$\{)/,
  },
  {
    id: "net.insecure-http",
    severity: "low",
    description: "Insecure http:// URL in production code",
    pattern:
      /\bhttp:\/\/(?!localhost\b|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:www\.)?(?:example|test)\.)/i,
  },
];

/** Matches test files for false-positive dampening. */
const TEST_FILE_RE = /(\.test\.|\.spec\.|(^|\/)__tests__\/)/;

/** Whether a repository-relative path looks like a test file. */
export function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}

/** Lowers a severity by one step (`low` stays `low`). */
export function dampenSeverity(severity: SecuritySeverity): SecuritySeverity {
  switch (severity) {
    case "critical":
      return "high";
    case "high":
      return "medium";
    case "medium":
      return "low";
    case "low":
      return "low";
  }
}

/**
 * Scans a single file's content line by line against {@link SECURITY_RULES}.
 * Findings in test files are dampened by one severity step. Tolerates `\r\n`
 * line endings; never throws.
 */
export function scanFileForFindings(path: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const dampen = isTestFile(path);
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          severity: dampen ? dampenSeverity(rule.severity) : rule.severity,
          rule: rule.id,
          file: path,
          line: i + 1,
          description: dampen
            ? `${rule.description} (severity reduced: test file)`
            : rule.description,
        });
      }
    }
  }
  return findings;
}
