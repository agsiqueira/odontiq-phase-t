import { readFile } from "node:fs/promises";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { BrowserJourneyRunner } from "../../src/runners/browserJourneyRunner.js";
import type { TestScenario } from "../../src/types/scenario.js";

export async function runScenarioAndAssert(
  page: Page,
  testInfo: TestInfo,
  scenario: TestScenario,
): Promise<void> {
  const result = await new BrowserJourneyRunner(page, {
    allowUiAuthenticationFallback: false,
  }).run(scenario);
  await testInfo.attach("phase-t-json-report", {
    body: await readFile(result.reportPath),
    contentType: "application/json",
  });

  const criticalOrFailureAssertions = result.run.assertions.filter(
    (assertion) =>
      assertion.status === "failed" &&
      (assertion.severity === "critical" || assertion.severity === "failure"),
  );
  const details = [
    result.run.errorMessage,
    ...criticalOrFailureAssertions.map((assertion) => `${assertion.id}: ${assertion.message}`),
  ].filter((message): message is string => Boolean(message));

  expect(
    result.run.overallStatus,
    `Phase T run ${result.run.runId} failed. Report: ${result.reportPath}\n${details.join("\n")}`,
  ).not.toMatch(/failed|error/);
}
