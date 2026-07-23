import type { ScenarioStep, TestScenario } from "../types/scenario.js";
import {
  case01BehaviorContract,
  case02BehaviorContract,
  case03BehaviorContract,
  case04BehaviorContract,
  case05BehaviorContract,
} from "./caseBehaviorContracts.js";

const expectation = (
  requiredPhrases: readonly string[] = [],
  prohibitedPhrases: readonly string[] = [],
): ScenarioStep["expectation"] => ({
  requiredPhrases,
  prohibitedPhrases,
  maximumResponseTimeMs: 30_000,
  requiresPatientRoleEvaluation: true,
});

export const npoReleaseScenario: TestScenario = {
  id: "phase-t-npo-case-01",
  name: "Case 1 NPO acknowledgement",
  caseId: "case-01",
  patientName: "Amara Johnson",
  encounterPath: "/encounter/case-01",
  attemptPolicy: "require-new",
  caseContract: case01BehaviorContract,
  steps: [{
    id: "npo-instruction",
    studentMessage: "Please do not eat or drink anything while we arrange your emergency assessment.",
    expectation: expectation(
      ["understand"],
      ["alcohol", "beer", "wine", "liquor", "last meal", "last ate"],
    ),
  }],
};

export const gumPalpationReleaseScenario: TestScenario = {
  id: "phase-t-case-03-gum-palpation",
  name: "Case 3 gum palpation",
  caseId: "case-03",
  patientName: "Elena Garcia",
  encounterPath: "/encounter/case-03",
  attemptPolicy: "require-new",
  caseContract: case03BehaviorContract,
  steps: [{
    id: "gum-palpation",
    studentMessage: "Does it hurt when you press or palpate the gum by the affected tooth?",
    expectation: expectation(
      ["yes"],
      ["/10", "fever", "allerg", "ibuprofen", "antibiotic", "cold"],
    ),
  }],
};

export const progressiveDisclosureReleaseScenario: TestScenario = {
  id: "phase-t-case-03-progressive-disclosure",
  name: "Case 3 progressive disclosure",
  caseId: "case-03",
  patientName: "Elena Garcia",
  encounterPath: "/encounter/case-03",
  attemptPolicy: "require-new",
  caseContract: case03BehaviorContract,
  steps: [
    { id: "general-pain", studentMessage: "Are you in pain?", expectation: expectation(["hurt"], ["8/10", "eight out of ten"]) },
    { id: "severity", studentMessage: "How severe is the pain from zero to ten?", expectation: expectation(["eight"]) },
    { id: "location", studentMessage: "Where does it hurt?", expectation: expectation(["right", "lower"]) },
    { id: "duration", studentMessage: "How long has it been hurting?", expectation: expectation(["day"]) },
    { id: "compound", studentMessage: "Does it hurt when you chew, and does the pain travel anywhere?", expectation: expectation(["chew", "ear"]) },
    { id: "unsupported", studentMessage: "Does bright sunlight change the tooth pain?", expectation: expectation([], ["yes", "definitely", "always"]) },
    { id: "confirm", studentMessage: "To confirm, the pain has been worsening for three days?", expectation: expectation(["three"]) },
  ],
};

export const allCaseSmokeScenarios: readonly TestScenario[] = [
  ["case-01", "Amara Johnson", case01BehaviorContract],
  ["case-02", "Marcus Lee", case02BehaviorContract],
  ["case-03", "Elena Garcia", case03BehaviorContract],
  ["case-04", "Noah Patel", case04BehaviorContract],
  ["case-05", "Sofia Williams", case05BehaviorContract],
].map(([caseId, patientName, caseContract]) => ({
  id: `phase-t-${caseId}-smoke`,
  name: `${patientName} release smoke`,
  caseId: caseId as string,
  patientName: patientName as string,
  encounterPath: `/encounter/${caseId}`,
  attemptPolicy: "require-new" as const,
  caseContract: caseContract as typeof case01BehaviorContract,
  steps: [{ id: "general-pain", studentMessage: "Are you in pain?", expectation: expectation(["hurt"]) }],
}));
