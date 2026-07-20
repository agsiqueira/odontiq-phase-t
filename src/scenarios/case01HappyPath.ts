import type { TestScenario } from "../types/scenario.js";

const expectation = {
  requiredPhrases: [],
  prohibitedPhrases: [],
  maximumResponseTimeMs: 30_000,
  requiresPatientRoleEvaluation: true,
} as const;

export const case01HappyPath: TestScenario = {
  id: "case-01-happy-path",
  name: "Case 1 initial patient interview",
  caseId: "case-01",
  steps: [
    {
      id: "case-01-step-01-chief-complaint",
      studentMessage: "What brings you in today?",
      expectation,
    },
    {
      id: "case-01-step-02-onset",
      studentMessage: "When did this problem start?",
      expectation,
    },
    {
      id: "case-01-step-03-pain-description",
      studentMessage: "Can you describe the pain?",
      expectation,
    },
  ],
};
