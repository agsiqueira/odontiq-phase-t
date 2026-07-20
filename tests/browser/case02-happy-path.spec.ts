import { test } from "@playwright/test";
import { case02HappyPath } from "../../src/scenarios/case02HappyPath.js";
import { runScenarioAndAssert } from "./scenarioTestSupport.js";

test("Case 2 happy-path browser journey", async ({ page }, testInfo) => {
  await runScenarioAndAssert(page, testInfo, case02HappyPath);
});
