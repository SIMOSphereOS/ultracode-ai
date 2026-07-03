import { ToolError } from "ultracode-shared";
import { describe, expect, it } from "vitest";
import { compileGlob, expandBraces, MAX_GLOB_SEGMENTS, matchGlob } from "./globMatch.js";

describe("expandBraces", () => {
  it("returns the pattern unchanged without braces", () => {
    expect(expandBraces("src/*.ts")).toEqual(["src/*.ts"]);
  });

  it("expands simple alternation", () => {
    expect(expandBraces("*.{js,ts}")).toEqual(["*.js", "*.ts"]);
  });

  it("expands nested braces", () => {
    expect(expandBraces("{a,{b,c}}.txt").sort()).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("expands multiple groups (cartesian product)", () => {
    expect(expandBraces("{a,b}/{x,y}").sort()).toEqual(["a/x", "a/y", "b/x", "b/y"]);
  });

  it("treats unbalanced braces literally", () => {
    expect(expandBraces("foo{bar")).toEqual(["foo{bar"]);
  });

  it("throws on brace bombs", () => {
    const bomb = Array.from({ length: 6 }, () => "{a,b,c,d,e,f}").join("/");
    expect(() => expandBraces(bomb)).toThrow(ToolError);
  });
});

describe("matchGlob", () => {
  const cases: Array<[pattern: string, path: string, expected: boolean]> = [
    // *
    ["*.ts", "index.ts", true],
    ["*.ts", "src/index.ts", false], // * does not cross "/"
    ["src/*.ts", "src/index.ts", true],
    ["src/*.ts", "src/a/b.ts", false],
    // **
    ["**/*.ts", "index.ts", true],
    ["**/*.ts", "a/b/c/index.ts", true],
    ["**/*.ts", "a/b/c/index.js", false],
    ["src/**", "src/a.txt", true],
    ["src/**", "src/a/b/c.txt", true],
    ["src/**", "other/a.txt", false],
    ["a/**/b", "a/b", true],
    ["a/**/b", "a/x/b", true],
    ["a/**/b", "a/x/y/b", true],
    ["a/**/b", "a/x/y/c", false],
    ["**", "anything/at/all.txt", true],
    // ?
    ["a?c", "abc", true],
    ["a?c", "ac", false],
    ["a?c", "a/c", false], // ? does not match "/"
    // braces
    ["*.{js,ts}", "x.ts", true],
    ["*.{js,ts}", "x.js", true],
    ["*.{js,ts}", "x.tsx", false],
    ["**/test/**/*.spec.{ts,tsx}", "a/test/unit/x.spec.tsx", true],
    // regex metacharacters are literal
    ["file(1).txt", "file(1).txt", true],
    ["file(1).txt", "file1.txt", false],
    ["a+b.txt", "a+b.txt", true],
    ["a.b", "axb", false], // "." is literal
    // unicode / emoji
    ["*.📄", "doc.📄", true],
    ["тест/*.txt", "тест/файл.txt", true],
    // exotic
    ["**/.*rc", "deep/dir/.npmrc", true],
    ["", "x", false],
  ];

  for (const [pattern, candidate, expected] of cases) {
    it(`"${pattern}" vs "${candidate}" → ${expected}`, () => {
      if (pattern === "") {
        expect(() => matchGlob(pattern, candidate)).toThrow(ToolError);
        return;
      }
      expect(matchGlob(pattern, candidate)).toBe(expected);
    });
  }

  it("compileGlob is reusable across candidates", () => {
    const matcher = compileGlob("src/**/*.{ts,tsx}");
    expect(matcher("src/a.ts")).toBe(true);
    expect(matcher("src/deep/b.tsx")).toBe(true);
    expect(matcher("lib/a.ts")).toBe(false);
  });

  it("handles huge candidate paths without catastrophic backtracking", () => {
    const matcher = compileGlob("**/a/**/b/**/c.txt");
    const candidate = `${"x/".repeat(5000)}a/${"y/".repeat(5000)}b/z/c.txt`;
    const started = Date.now();
    expect(matcher(candidate)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  // SEC-002: many consecutive `**` would emit several `(?:[^/]+/)*` groups and
  // backtrack exponentially. They must collapse to a single `**` first, so a
  // pathological non-matching path terminates near-instantly.
  it("collapses consecutive ** to avoid catastrophic backtracking (<50ms)", () => {
    const matcher = compileGlob("**/**/**/**/**/**/**/**/end");
    const nonMatching = `${"a/".repeat(60)}nope`;
    const started = Date.now();
    expect(matcher(nonMatching)).toBe(false);
    expect(Date.now() - started).toBeLessThan(50);
  });

  // Collapsing `**/**` ≡ `**` must not change which paths match.
  it("preserves semantics when collapsing consecutive ** (** vs **/**)", () => {
    const single = compileGlob("a/**/b");
    const doubled = compileGlob("a/**/**/b");
    const cases = ["a/b", "a/x/b", "a/x/y/b", "a/b/c", "x/a/b"];
    for (const c of cases) {
      expect(doubled(c)).toBe(single(c));
    }
    expect(doubled("a/b")).toBe(true);
    expect(doubled("a/x/y/b")).toBe(true);
    expect(doubled("a/b/c")).toBe(false);
  });
});
