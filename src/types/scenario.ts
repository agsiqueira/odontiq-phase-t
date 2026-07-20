export interface ScenarioExpectation {
  requiredPhrases: readonly string[];
  prohibitedPhrases: readonly string[];
  maximumResponseTimeMs: number;
  requiresPatientRoleEvaluation: boolean;
  semanticIntent?: string;
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
  patientName: string;
  encounterPath: string;
  steps: readonly ScenarioStep[];
}
