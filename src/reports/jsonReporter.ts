import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SyntheticTestRun } from "../types/testResult.js";

const sensitiveKeyPattern = /password|token|cookie|authorization|session|secret/i;
const bearerPattern = /bearer\s+[a-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const clerkIdentifierPattern = /\b(?:sess|client|user)_[a-zA-Z0-9]+\b/g;
const clerkKeyPattern = /\b(?:pk|sk)_(?:test|live)_[a-zA-Z0-9_-]+\b/g;

export class JsonReporter {
  public constructor(
    private readonly outputDirectory = path.resolve("artifacts", "reports", "runs"),
  ) {}

  public async write(run: SyntheticTestRun): Promise<string> {
    await mkdir(this.outputDirectory, { recursive: true });
    const timestamp = (run.completedAt ?? run.startedAt).replace(/[:.]/g, "-");
    const filename = [
      safeSegment(run.environmentName),
      safeSegment(run.caseId),
      safeSegment(run.scenarioId),
      timestamp,
      safeSegment(run.runId),
    ].join("_") + ".json";
    const reportPath = path.join(this.outputDirectory, filename);
    run.reportStatus = "written";
    run.reportPath = path.resolve(reportPath);
    const sanitized = sanitizeForReport(run);
    await writeFile(reportPath, `${JSON.stringify(sanitized, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return reportPath;
  }
}

export function sanitizeForReport<T>(value: T): T {
  return sanitize(value, new WeakSet<object>()) as T;
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[REDACTED]" : sanitize(item, seen),
    ]),
  );
}

function redactString(value: string): string {
  let sanitized = value
    .replace(bearerPattern, "[REDACTED]")
    .replace(jwtPattern, "[REDACTED]")
    .replace(clerkIdentifierPattern, "[REDACTED]")
    .replace(clerkKeyPattern, "[REDACTED]");
  for (const credential of [
    process.env.PHASE_T_TEST_EMAIL,
    process.env.PHASE_T_TEST_PASSWORD,
    process.env.CLERK_PUBLISHABLE_KEY,
    process.env.CLERK_SECRET_KEY,
    process.env.CLERK_TESTING_TOKEN,
  ]) {
    if (credential) {
      sanitized = sanitized.split(credential).join("[REDACTED]");
    }
  }
  return sanitized;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
