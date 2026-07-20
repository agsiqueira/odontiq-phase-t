export type TestSeverity = "info" | "warning" | "failure" | "critical";

export type TestCheckStatus = "passed" | "failed" | "skipped";

export type RunStatus = "passed" | "warning" | "failed" | "error";

export type CompletionStatus = "not-attempted" | "completed" | "failed";

export type PersistenceStatus = "not-checked" | "confirmed" | "failed";

export type ReportStatus = "pending" | "written" | "failed";

export type AuthenticatedStateUsage = "clerk-storage-state" | "storage-state-or-ui-fallback";

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
}

export interface FailedNetworkRequest {
  method: string;
  url: string;
  failureText: string | null;
  httpStatus: number | null;
  expectedNavigationAbort: boolean;
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
}
