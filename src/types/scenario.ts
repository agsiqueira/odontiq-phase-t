export interface ScenarioExpectation {
  requiredPhrases: readonly string[];
  prohibitedPhrases: readonly string[];
  maximumResponseTimeMs: number;
  requiresPatientRoleEvaluation: boolean;
}

export interface ScenarioStep {
  id: string;
  studentMessage: string;
  expectation: ScenarioExpectation;
}

export interface TestScenario {
  id: string;
  name: string;
  caseId: string;
  steps: readonly ScenarioStep[];
}
