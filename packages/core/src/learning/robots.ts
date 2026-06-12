/**
 * Minimal `robots.txt` parsing and matching.
 *
 * Implements the practical subset of the Robots Exclusion Protocol the crawler
 * needs: `User-agent` grouping, `Allow`/`Disallow` rules with `*` wildcards and
 * `$` end-anchors, and longest-match-wins precedence (with `Allow` winning
 * ties, per Google's de-facto standard). Sitemap directives are also surfaced.
 */

/** A single Allow/Disallow rule. */
interface RobotsRule {
  allow: boolean;
  /** Compiled matcher derived from the path pattern. */
  pattern: RegExp;
  /** Length of the raw path pattern (for longest-match precedence). */
  length: number;
}

/** Parsed `robots.txt`: rules keyed for matching, plus advertised sitemaps. */
export interface RobotsTxt {
  /** Rules applying to the selected user-agent group. */
  rules: RobotsRule[];
  /** Sitemap URLs advertised in the file. */
  sitemaps: string[];
  /** Whether any group matched the requested agent (else `*` / empty). */
  matchedAgent: boolean;
}

/**
 * Parse `robots.txt` content, selecting the rule group for `userAgent`
 * (case-insensitive substring match) and falling back to the `*` group.
 *
 * @param content - Raw `robots.txt` body (may be empty).
 * @param userAgent - Crawler agent token (e.g. `"ultracode"`).
 */
export function parseRobots(content: string, userAgent: string): RobotsTxt {
  const sitemaps: string[] = [];
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of (content ?? "").split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      // An empty Disallow means "allow all" and is represented as no rule.
      if (field === "disallow" && value === "") continue;
      current.rules.push({
        allow: field === "allow",
        pattern: compilePattern(value),
        length: value.length,
      });
    }
  }

  const ua = userAgent.toLowerCase();
  let chosen = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  let matchedAgent = chosen !== undefined;
  if (!chosen) chosen = groups.find((g) => g.agents.includes("*"));

  return { rules: chosen?.rules ?? [], sitemaps, matchedAgent };
}

/**
 * Whether `pathname` (path + query) is crawlable under `robots`.
 *
 * Longest matching pattern wins; on equal length, `Allow` wins. No matching
 * rule means allowed.
 */
export function isAllowed(robots: RobotsTxt, pathname: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!rule.pattern.test(pathname)) continue;
    if (
      best === null ||
      rule.length > best.length ||
      (rule.length === best.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** Convenience: parse + test a full URL's path against the file. */
export function urlAllowed(robots: RobotsTxt, url: string): boolean {
  try {
    const u = new URL(url);
    return isAllowed(robots, u.pathname + u.search);
  } catch {
    return true;
  }
}

/** Strip a trailing `#` comment. */
function stripComment(line: string): string {
  const i = line.indexOf("#");
  return i === -1 ? line : line.slice(0, i);
}

/** Compile a robots path pattern (`*` wildcard, `$` anchor) to a RegExp. */
function compilePattern(pattern: string): RegExp {
  let re = "^";
  let anchored = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      re += ".*";
    } else if (ch === "$" && i === pattern.length - 1) {
      re += "$";
      anchored = true;
    } else {
      re += escapeRe(ch as string);
    }
  }
  void anchored;
  return new RegExp(re);
}

/** Escape a single character for literal use in a RegExp. */
function escapeRe(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? "\\" + ch : ch;
}
