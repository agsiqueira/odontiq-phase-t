import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { BrowserJourneyRunner } from "../../src/runners/browserJourneyRunner.js";
import { case01CompletionReport } from "../../src/scenarios/case01CompletionReport.js";

test("Case 1 completion and Faculty Rubric Report", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const result = await new BrowserJourneyRunner(page, { allowUiAuthenticationFallback: false })
    .runCompletionReport(case01CompletionReport);
  await testInfo.attach("phase-t-json-report", {
    body: await readFile(result.reportPath),
    contentType: "application/json",
  });
  expect(
    result.run.overallStatus,
    `Phase T completion run failed. Report: ${result.reportPath}\n${result.run.errorMessage ?? "deterministic report validation failed"}`,
  ).not.toMatch(/failed|error/);
});
