import { test } from "@playwright/test";
import { behavioralScenarios } from "../../src/scenarios/behavioralScenarios.js";
import { runScenarioAndAssert } from "./scenarioTestSupport.js";

for (const scenario of behavioralScenarios) {
  test(`${scenario.caseId} ${scenario.behavioralStyle}`, async ({ page }, testInfo) => {
    await runScenarioAndAssert(page, testInfo, scenario);
  });
}
