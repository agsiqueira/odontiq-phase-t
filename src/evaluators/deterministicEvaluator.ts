import type { ScenarioExpectation } from "../types/scenario.js";
import type { TestAssertionResult } from "../types/testResult.js";

export const patientRoleViolationPatterns: readonly RegExp[] = [
  /you should prescribe/i,
  /you should order/i,
  /the correct diagnosis is/i,
  /your differential should include/i,
  /as your instructor/i,
  /you need to ask me/i,
];

export interface DeterministicEvaluationInput {
  stepId: string;
  response: string | null;
  elapsedResponseTimeMs: number;
  timedOut: boolean;
  visibleApplicationError: string | null;
  expectation: ScenarioExpectation;
}

export function evaluateDeterministically(input: DeterministicEvaluationInput): TestAssertionResult[] {
  const response = input.response ?? "";
  const normalizedResponse = response.toLocaleLowerCase();
  const results: TestAssertionResult[] = [];

  results.push({
    id: `${input.stepId}-timeout`,
    name: "Patient response completed before timeout",
    status: input.timedOut ? "failed" : "passed",
    severity: input.timedOut ? "critical" : "info",
    message: input.timedOut ? "The patient response timed out." : "The patient response completed before timeout.",
    expected: false,
    actual: input.timedOut,
  });

  const isEmpty = response.trim().length === 0;
  results.push({
    id: `${input.stepId}-non-empty`,
    name: "Patient response is not empty",
    status: isEmpty ? "failed" : "passed",
    severity: isEmpty ? "failure" : "info",
    message: isEmpty ? "The patient response was empty." : "The patient response contained text.",
  });

  const exceededMaximum = input.elapsedResponseTimeMs > input.expectation.maximumResponseTimeMs;
  results.push({
    id: `${input.stepId}-response-time`,
    name: "Patient response time",
    status: exceededMaximum ? "failed" : "passed",
    severity: exceededMaximum ? "failure" : "info",
    message: exceededMaximum
      ? `Response took ${input.elapsedResponseTimeMs} ms, exceeding ${input.expectation.maximumResponseTimeMs} ms.`
      : `Response completed in ${input.elapsedResponseTimeMs} ms.`,
    expected: input.expectation.maximumResponseTimeMs,
    actual: input.elapsedResponseTimeMs,
  });

  for (const phrase of input.expectation.requiredPhrases) {
    const present = normalizedResponse.includes(phrase.toLocaleLowerCase());
    results.push({
      id: `${input.stepId}-required-${slug(phrase)}`,
      name: `Required phrase: ${phrase}`,
      status: present ? "passed" : "failed",
      severity: present ? "info" : "failure",
      message: present ? `Required phrase "${phrase}" appeared.` : `Required phrase "${phrase}" did not appear.`,
    });
  }

  for (const phrase of input.expectation.prohibitedPhrases) {
    const present = normalizedResponse.includes(phrase.toLocaleLowerCase());
    results.push({
      id: `${input.stepId}-prohibited-${slug(phrase)}`,
      name: `Prohibited phrase: ${phrase}`,
      status: present ? "failed" : "passed",
      severity: present ? "failure" : "info",
      message: present ? `Prohibited phrase "${phrase}" appeared.` : `Prohibited phrase "${phrase}" did not appear.`,
    });
  }

  const hasVisibleError = Boolean(input.visibleApplicationError);
  results.push({
    id: `${input.stepId}-visible-error`,
    name: "No visible application error",
    status: hasVisibleError ? "failed" : "passed",
    severity: hasVisibleError ? "critical" : "info",
    message: hasVisibleError ? `Visible application error: ${input.visibleApplicationError}` : "No visible application error was detected.",
  });

  if (input.expectation.requiresPatientRoleEvaluation) {
    const violation = patientRoleViolationPatterns.find((pattern) => pattern.test(response));
    results.push({
      id: `${input.stepId}-patient-role`,
      name: "Basic patient-role language check",
      status: violation ? "failed" : "passed",
      severity: violation ? "failure" : "info",
      message: violation
        ? `Response matched a basic patient-role violation pattern: ${violation.source}.`
        : "No configured patient-role violation pattern matched. This heuristic is not a complete role evaluation.",
    });
  }

  return results;
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
