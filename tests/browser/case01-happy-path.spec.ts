import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { BrowserJourneyRunner } from "../../src/runners/browserJourneyRunner.js";
import { case01HappyPath } from "../../src/scenarios/case01HappyPath.js";

test("Case 1 happy-path browser journey", async ({ page }, testInfo) => {
  const result = await new BrowserJourneyRunner(page, {
    allowUiAuthenticationFallback: false,
  }).run(case01HappyPath);
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
});
