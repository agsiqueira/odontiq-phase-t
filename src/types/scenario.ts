export interface ScenarioExpectation {
  requiredPhrases: readonly string[];
  prohibitedPhrases: readonly string[];
  maximumResponseTimeMs: number;
  requiresPatientRoleEvaluation: boolean;
  semanticIntent?: string;
  relevantTerms?: readonly string[];
  allowVerbatimPatientRepeat?: boolean;
}

export type BehavioralStyle = "standard-clinical" | "short-direct" | "compound-imperfect" | "treatment-closing";

export interface StableCaseFact {
  id: string;
  label: string;
  acceptedPatterns: readonly RegExp[];
  contradictionPatterns: readonly RegExp[];
  canonicalDurationDays?: number;
  directQuestionPatterns?: readonly RegExp[];
  canonicalLocation?: "upper-left" | "upper-right" | "lower-left" | "lower-right";
}

export interface ProgressiveDisclosureRule {
  id: string;
  label: string;
  patterns: readonly RegExp[];
  revealFromStep: number;
}

export interface CaseBehaviorContract {
  permittedFacts: readonly string[];
  stableFacts: readonly StableCaseFact[];
  progressiveDisclosure?: readonly ProgressiveDisclosureRule[];
  firstResponseFactLimit?: number;
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
  attemptPolicy?: "resume" | "prefer-new" | "require-new" | "reuse-completed-report";
  behavioralStyle?: BehavioralStyle;
  caseContract?: CaseBehaviorContract;
  steps: readonly ScenarioStep[];
}
