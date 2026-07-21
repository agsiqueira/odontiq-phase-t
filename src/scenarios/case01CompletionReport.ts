import type { TestScenario } from "../types/scenario.js";

const expectation = {
  requiredPhrases: [],
  prohibitedPhrases: [],
  maximumResponseTimeMs: 30_000,
  requiresPatientRoleEvaluation: true,
} as const;

export const case01CompletionReport: TestScenario = {
  id: "case-01-completion-report",
  name: "Case 1 completed consultation and Faculty Rubric Report",
  caseId: "case-01",
  patientName: "Amara Johnson",
  encounterPath: "/encounter/case-01",
  attemptPolicy: "require-new",
  steps: [
    { id: "case-01-report-01-introduction", studentMessage: "Hello Amara, I am your dental clinician today. What is bothering you most?", expectation },
    { id: "case-01-report-02-history", studentMessage: "When did the tooth pain and swelling begin, and how severe is the pain?", expectation },
    { id: "case-01-report-03-red-flags", studentMessage: "Are you having trouble breathing or swallowing now, and have you had a fever?", expectation },
    { id: "case-01-report-04-medical-history", studentMessage: "Do you have any medical conditions or medication allergies?", expectation },
    { id: "case-01-report-05-medications", studentMessage: "What medications are you currently taking, including anything used for this pain?", expectation },
    { id: "case-01-report-06-care-plan", studentMessage: "Because facial swelling with breathing or swallowing difficulty can be serious, you need urgent emergency assessment today.", expectation },
    { id: "case-01-report-07-close", studentMessage: "Do you understand the urgent next steps, and is there anything else you need clarified before we finish?", expectation },
  ],
};
