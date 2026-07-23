import { expect, test } from "@playwright/test";
import { OdontiqBrowserClient } from "../../src/clients/odontiqBrowserClient.js";
import { environment } from "../../src/config/environment.js";
import { selectors } from "../../src/config/selectors.js";
import {
  allCaseSmokeScenarios,
  gumPalpationReleaseScenario,
  npoReleaseScenario,
  progressiveDisclosureReleaseScenario,
} from "../../src/scenarios/releaseScenarios.js";
import { runScenarioAndAssert } from "./scenarioTestSupport.js";

test.describe.configure({ mode: "serial" });

test("new encounter onboarding and Back to cases", async ({ page }) => {
  const client = new OdontiqBrowserClient(page, environment.baseUrl);
  await client.openApplication();
  await client.authenticate({ email: environment.testEmail, password: environment.testPassword }, false);
  await client.navigateToCaseList();
  const progression = page.waitForResponse((response) =>
    response.request().method() === "GET" && new URL(response.url()).pathname === "/api/home/progression",
  );
  await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.endsWith(":encounterSnapshots") && key !== "odontiq:encounterSnapshots") continue;
      localStorage.setItem(key, "{}");
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await progression;
  const cases = [
    ["case-01", "Amara Johnson"],
    ["case-02", "Marcus Lee"],
    ["case-03", "Elena Garcia"],
    ["case-04", "Noah Patel"],
    ["case-05", "Sofia Williams"],
  ] as const;
  let action = selectors.caseAction(selectors.caseCard(page, cases[0][0], cases[0][1]).first(), `/encounter/${cases[0][0]}`).first();
  let label = "";
  for (const [caseId, patientName] of cases) {
    const candidate = selectors.caseAction(selectors.caseCard(page, caseId, patientName).first(), `/encounter/${caseId}`).first();
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const candidateLabel = (await candidate.innerText()).trim();
    if (!/^resume case$/i.test(candidateLabel)) {
      action = candidate;
      label = candidateLabel;
      break;
    }
  }
  test.skip(!label, "Every case has an active server encounter; onboarding requires one clean case.");
  await action.click();
  await expect(selectors.onboardingHeading(page), `Action ${label} should open onboarding`).toBeVisible();
  await expect(selectors.onboardingSteps(page)).toHaveCount(4);
  await expect(selectors.startConsultationButton(page).first()).toBeEnabled();
  await expect(selectors.onboardingBackAction(page)).toBeVisible();
  await expect(selectors.encounterRoot(page)).toHaveCount(0);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/Ludwig|abscess|antibiotic|OMFS|84%|medal|checklist/i);
  await selectors.onboardingBackAction(page).click();
  await expect(page).toHaveURL(/\/cases(?:[/?#]|$)/);
});

test("NPO acknowledgement does not become alcohol history", async ({ page }, testInfo) => {
  await runScenarioAndAssert(page, testInfo, npoReleaseScenario);
});

test("Case 3 gum palpation remains concise and case-specific", async ({ page }, testInfo) => {
  await runScenarioAndAssert(page, testInfo, gumPalpationReleaseScenario);
});

test("Case 3 progressive disclosure sequence", async ({ page }, testInfo) => {
  await runScenarioAndAssert(page, testInfo, progressiveDisclosureReleaseScenario);
});

test("Case 2 corrected examination image renders and zooms without mirroring", async ({ page }, testInfo) => {
  const client = new OdontiqBrowserClient(page, environment.baseUrl);
  await client.openApplication();
  await client.authenticate({ email: environment.testEmail, password: environment.testPassword }, false);
  await client.navigateToCaseList();
  const fresh = await client.createFreshEncounter("case-02");
  const selected = await client.selectCase({ caseId: "case-02", patientName: "Marcus Lee", encounterPath: "/encounter/case-02", attemptPolicy: "resume" });
  expect(selected.attemptStateUsed).toBe("resumed");
  await client.startConsultation();
  await client.verifyFreshEncounter(fresh.encounterId);
  await selectors.examinationButton(page).click();
  await expect(selectors.examinationHeading(page)).toBeVisible();
  await page.getByRole("button", { name: /^focused dental examination image$/i }).click();
  const image = selectors.examinationImage(page).first();
  await expect(image).toHaveAttribute("src", /examination-01-v2\.png/);
  const evidence = await image.evaluate((node: HTMLImageElement) => ({
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
    rect: node.getBoundingClientRect().toJSON(),
    transform: getComputedStyle(node).transform,
  }));
  expect(evidence.naturalWidth).toBe(447);
  expect(evidence.naturalHeight).toBe(322);
  expect(evidence.transform).not.toMatch(/matrix\(-1|scaleX\(-1/);
  expect(evidence.rect.width / evidence.rect.height).toBeCloseTo(447 / 322, 1);
  await image.click();
  await expect(selectors.examinationImage(page).last()).toHaveAttribute("src", /examination-01-v2\.png/);
  await page.screenshot({ path: testInfo.outputPath("case-02-corrected-examination.png"), fullPage: false });
});

for (const scenario of allCaseSmokeScenarios) {
  test(`${scenario.caseId} browser smoke`, async ({ page }, testInfo) => {
    await runScenarioAndAssert(page, testInfo, scenario);
  });
}
