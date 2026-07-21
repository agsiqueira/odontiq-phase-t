import type { TestScenario } from "../types/scenario.js";

const patientRoleExpectation = {
  prohibitedPhrases: [],
  maximumResponseTimeMs: 30_000,
  requiresPatientRoleEvaluation: true,
} as const;

export const case02HappyPath: TestScenario = {
  id: "case-02-happy-path",
  name: "Case 2 focused emergency patient interview",
  caseId: "case-02",
  patientName: "Marcus Lee",
  encounterPath: "/encounter/case-02",
  attemptPolicy: "prefer-new",
  steps: [
    {
      id: "case-02-step-01-professional-opening",
      studentMessage: "Hello Marcus, I'm your dental clinician today. Can you tell me what is bothering you most?",
      expectation: {
        ...patientRoleExpectation,
        requiredPhrases: ["pain"],
        semanticIntent: "Elicit the patient's chief complaint after a professional introduction.",
      },
    },
    {
      id: "case-02-step-02-symptom-focus",
      studentMessage: "When did the upper-right tooth pain begin, and have you felt feverish?",
      expectation: {
        ...patientRoleExpectation,
        requiredPhrases: ["fever"],
        semanticIntent: "Clarify symptom onset and systemic symptoms associated with the dental pain.",
      },
    },
    {
      id: "case-02-step-03-airway-follow-up",
      studentMessage: "Have you had any swelling or trouble swallowing or breathing?",
      expectation: {
        ...patientRoleExpectation,
        requiredPhrases: ["swallow"],
        semanticIntent: "Screen for swelling and airway-related red flags.",
      },
    },
  ],
};
