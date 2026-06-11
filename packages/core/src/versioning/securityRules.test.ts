import { describe, expect, it } from "vitest";
import { dampenSeverity, isTestFile, scanFileForFindings } from "./securityRules.js";

// All "secrets" below are synthetic fixtures, assembled at runtime so that no
// secret-shaped literal ever appears in this source file.
const FAKE_AWS_KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const PEM_HEADER = ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("");
const apiKeyLine = (): string => ["const apiK", 'ey = "dummy-value-123456";'].join("");
const passwordLine = (): string => ["const cfg = { passw", 'ord: "hunter2-dummy" };'].join("");

describe("scanFileForFindings", () => {
  it("flags hardcoded AWS access keys as critical", () => {
    const findings = scanFileForFindings("src/config.ts", `const key = "${FAKE_AWS_KEY}";`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "secret.aws-access-key-id",
      severity: "critical",
      file: "src/config.ts",
      line: 1,
    });
  });

  it("flags PEM private key blocks", () => {
    const findings = scanFileForFindings("deploy/key.ts", `const pem = \`${PEM_HEADER}\`;`);
    expect(findings.some((f) => f.rule === "secret.private-key" && f.severity === "critical")).toBe(
      true,
    );
  });

  it("flags generic credential assignments with literal values", () => {
    const content = [apiKeyLine(), passwordLine()].join("\n");
    const findings = scanFileForFindings("src/auth.ts", content);
    expect(findings.filter((f) => f.rule === "secret.hardcoded-credential")).toHaveLength(2);
    expect(findings[1]?.line).toBe(2);
  });

  it("does not flag credentials read from the environment", () => {
    const findings = scanFileForFindings("src/auth.ts", "const apiKey = process.env.API_KEY;");
    expect(findings).toHaveLength(0);
  });

  it("flags eval() and new Function()", () => {
    const content = 'eval("dangerous");\nconst f = new Function("return 1");';
    const findings = scanFileForFindings("src/danger.ts", content);
    expect(findings.filter((f) => f.rule === "code.dynamic-eval")).toHaveLength(2);
  });

  it("flags child_process calls built via concatenation or interpolation", () => {
    const content = ['exec("ls " + userInput);', "execSync(`rm ${file}`);"].join("\n");
    const findings = scanFileForFindings("src/run.ts", content);
    expect(findings.filter((f) => f.rule === "code.child-process-concat")).toHaveLength(2);
  });

  it("does not flag spawn with an argument array", () => {
    const findings = scanFileForFindings("src/run.ts", 'spawn("git", ["status"], { cwd });');
    expect(findings).toHaveLength(0);
  });

  it("flags insecure http:// URLs but tolerates localhost", () => {
    const content = [
      'const a = "http://api.payments.some-corp.io";',
      'const b = "http://localhost:8080";',
    ].join("\n");
    const findings = scanFileForFindings("src/net.ts", content);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: "net.insecure-http", line: 1 });
  });

  it("dampens severity by one step in test files", () => {
    const content = `const key = "${FAKE_AWS_KEY}";`;
    const prod = scanFileForFindings("src/config.ts", content);
    const test = scanFileForFindings("src/config.test.ts", content);
    expect(prod[0]?.severity).toBe("critical");
    expect(test[0]?.severity).toBe("high");
    expect(test[0]?.description).toMatch(/test file/);
  });

  it("counts lines with \\r\\n endings correctly", () => {
    const content = `const a = 1;\r\nconst key = "${FAKE_AWS_KEY}";\r\n`;
    const findings = scanFileForFindings("src/win.ts", content);
    expect(findings[0]?.line).toBe(2);
  });

  it("handles empty, unicode and >=1MB inputs without throwing", () => {
    expect(scanFileForFindings("a.ts", "")).toHaveLength(0);
    expect(scanFileForFindings("emoji.ts", "const greeting = '👋🌍 𝔘𝔫𝔦𝔠𝔬𝔡𝔢';")).toHaveLength(0);
    const huge = `${"const x = 1;\n".repeat(90_000)}const key = "${FAKE_AWS_KEY}";\n`;
    expect(huge.length).toBeGreaterThan(1_048_576);
    const findings = scanFileForFindings("huge.ts", huge);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(90_001);
  });
});

describe("helpers", () => {
  it("isTestFile matches test/spec/__tests__ paths", () => {
    expect(isTestFile("src/a.test.ts")).toBe(true);
    expect(isTestFile("src/a.spec.tsx")).toBe(true);
    expect(isTestFile("src/__tests__/a.ts")).toBe(true);
    expect(isTestFile("src/attest.ts")).toBe(false);
  });

  it("dampenSeverity lowers one step and floors at low", () => {
    expect(dampenSeverity("critical")).toBe("high");
    expect(dampenSeverity("high")).toBe("medium");
    expect(dampenSeverity("medium")).toBe("low");
    expect(dampenSeverity("low")).toBe("low");
  });
});
