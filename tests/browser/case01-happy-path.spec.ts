import { test } from "@playwright/test";
import { case01HappyPath } from "../../src/scenarios/case01HappyPath.js";
import { runScenarioAndAssert } from "./scenarioTestSupport.js";

test("Case 1 happy-path browser journey", async ({ page }, testInfo) => {
  await runScenarioAndAssert(page, testInfo, case01HappyPath);
});
