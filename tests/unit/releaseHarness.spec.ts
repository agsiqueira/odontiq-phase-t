import { expect, test } from "@playwright/test";
import { sanitizeForReport } from "../../src/reports/jsonReporter.js";
import {
  allCaseSmokeScenarios,
  gumPalpationReleaseScenario,
  npoReleaseScenario,
  progressiveDisclosureReleaseScenario,
} from "../../src/scenarios/releaseScenarios.js";

test("release scenarios have unique identities and cover every canonical case", () => {
  const scenarios = [
    npoReleaseScenario,
    gumPalpationReleaseScenario,
    progressiveDisclosureReleaseScenario,
    ...allCaseSmokeScenarios,
  ];
  expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
  expect(new Set(allCaseSmokeScenarios.map((scenario) => scenario.caseId))).toEqual(
    new Set(["case-01", "case-02", "case-03", "case-04", "case-05"]),
  );
  for (const scenario of scenarios) {
    expect(scenario.encounterPath).toBe(`/encounter/${scenario.caseId}`);
    expect(scenario.steps.length).toBeGreaterThan(0);
    expect(scenario.attemptPolicy).toBe("require-new");
  }
});

test("release report sanitization redacts credential-shaped fields and values", () => {
  const sanitized = sanitizeForReport({
    authorization: "Bearer abc.def.ghi",
    nested: {
      sessionId: "sess_example123",
      diagnostic: "token Bearer abc123 and sk_test_example",
      safe: "case-03",
    },
  });
  expect(sanitized.authorization).toBe("[REDACTED]");
  expect(sanitized.nested.sessionId).toBe("[REDACTED]");
  expect(sanitized.nested.diagnostic).not.toContain("abc123");
  expect(sanitized.nested.diagnostic).not.toContain("sk_test_example");
  expect(sanitized.nested.safe).toBe("case-03");
});
