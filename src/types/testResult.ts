export type TestSeverity = "info" | "warning" | "failure" | "critical";

export type TestCheckStatus = "passed" | "failed" | "skipped";

export type RunStatus = "passed" | "warning" | "failed" | "error";

export type CompletionStatus = "not-attempted" | "completed" | "failed";

export type PersistenceStatus = "not-checked" | "confirmed" | "failed";

export type ReportStatus = "pending" | "written" | "failed";

export type AuthenticatedStateUsage = "clerk-storage-state" | "storage-state-or-ui-fallback";

export type AttemptStateUsed = "started" | "resumed" | "restarted" | "completed-report-reused" | "unknown";

export interface StageTiming {
  stage: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "passed" | "failed" | "timed-out";
}

export interface FacultyReportTranscriptEntry {
  role: "Student" | "Patient";
  text: string;
  timestamp?: string;
}

export interface FacultyReportResult {
  heading: string;
  caseIdentity: string | null;
  studentIdentity: string | null;
  completedAt: string | null;
  score: number | null;
  scoreRange: string | null;
  strengths: string[];
  areasForImprovement: string[];
  transcript: FacultyReportTranscriptEntry[];
  sectionPresence: Record<string, boolean>;
}

export interface EncounterCompletionResult {
  attemptStateUsed: AttemptStateUsed;
  conversationStepCount: number;
  completionControlLabel: string | null;
  completionHttpStatus: number | null;
  evaluationRequestUrl: string | null;
  evaluationHttpStatus: number | null;
  completionClickedAt: string | null;
  reportNavigationAt: string | null;
  reportHeadingVisibleAt: string | null;
  reportGenerationDurationMs: number | null;
  reportExtractionDurationMs: number | null;
  reportUrl: string | null;
  facultyReport: FacultyReportResult | null;
}

export interface TestAssertionResult {
  id: string;
  name: string;
  status: TestCheckStatus;
  severity: TestSeverity;
  message: string;
  expected?: string | number | boolean;
  actual?: string | number | boolean | null;
}

export interface ConversationStepResult {
  stepId: string;
  studentMessage: string;
  patientResponse: string | null;
  startedAt: string;
  completedAt: string;
  elapsedResponseTimeMs: number;
  timedOut: boolean;
  httpStatus: number | null;
  visibleApplicationError: string | null;
  diagnosticMessage: string | null;
  assertions: TestAssertionResult[];
  semanticEvaluation?: SemanticTurnEvaluation | null;
  disclosedStableFactIds?: string[];
}

export type SemanticDimensionName = "patientRoleFidelity" | "questionRelevance" | "caseConsistency" | "naturalPatientDialogue" | "artifactFree" | "disclosureCompliance" | "clinicalSafety";
export interface SemanticDimensionResult { score: 0 | 1 | 2; reason: string; }
export type SemanticTurnEvaluation = Record<SemanticDimensionName, SemanticDimensionResult>;

export interface FailedNetworkRequest {
  method: string;
  url: string;
  failureText: string | null;
  httpStatus: number | null;
  expectedNavigationAbort: boolean;
}

export interface EncounterSetupDiagnostics {
  browserContextId: string;
  requestedFreshEncounterId: string | null;
  boundEncounterId: string | null;
  newAttemptCreated: boolean;
  initialTranscriptNodeCount: number;
  initialPatientCount: number;
  initialStudentCount: number;
  finalPatientCount: number | null;
  finalStudentCount: number | null;
  workflow: "fresh-start-api";
  setupDurationMs: number;
  endpointFailures: string[];
  abortedBeforeConversation: boolean;
}

export interface SyntheticTestRun {
  runId: string;
  environmentName: string;
  caseId: string;
  patientName: string;
  scenarioId: string;
  authenticatedStateUsage: AuthenticatedStateUsage;
  startedAt: string;
  completedAt: string | null;
  overallStatus: RunStatus;
  steps: ConversationStepResult[];
  assertions: TestAssertionResult[];
  completionStatus: CompletionStatus;
  persistenceStatus: PersistenceStatus;
  reportStatus: ReportStatus;
  reportPath: string | null;
  browserConsoleErrors: string[];
  pageErrors: string[];
  failedNetworkRequests: FailedNetworkRequest[];
  failureUrl: string | null;
  activeStepIdAtFailure: string | null;
  errorMessage: string | null;
  encounterCompletion?: EncounterCompletionResult;
  stageTimings: StageTiming[];
  firstFailingStage: string | null;
  setupDiagnostics: EncounterSetupDiagnostics;
}
