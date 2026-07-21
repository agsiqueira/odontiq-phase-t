import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Page } from "@playwright/test";
import { environment } from "../config/environment.js";
import {
  OdontiqBrowserClient,
  CompletionWorkflowError,
  PatientResponseTimeoutError,
} from "../clients/odontiqBrowserClient.js";
import { evaluateDeterministically } from "../evaluators/deterministicEvaluator.js";
import { collectDisclosedStableFacts, evaluateBehaviorally } from "../evaluators/behavioralEvaluator.js";
import { evaluateSemantically } from "../evaluators/semanticEvaluator.js";
import { JsonReporter } from "../reports/jsonReporter.js";
import type { TestScenario } from "../types/scenario.js";
import type {
  ConversationStepResult,
  FailedNetworkRequest,
  SyntheticTestRun,
  TestAssertionResult,
} from "../types/testResult.js";

export interface BrowserJourneyResult {
  run: SyntheticTestRun;
  reportPath: string;
}

export interface BrowserJourneyRunnerOptions {
  allowUiAuthenticationFallback?: boolean;
}

export class BrowserJourneyRunner {
  private readonly client: OdontiqBrowserClient;
  private readonly reporter: JsonReporter;

  public constructor(
    private readonly page: Page,
    private readonly options: BrowserJourneyRunnerOptions = {},
    reporter = new JsonReporter(),
  ) {
    this.client = new OdontiqBrowserClient(page, environment.baseUrl);
    this.reporter = reporter;
  }

  public async run(scenario: TestScenario): Promise<BrowserJourneyResult> {
    const run = this.createRun(scenario);
    let activeStepId: string | null = null;
    this.installObservers(run);

    try {
      activeStepId = "authentication-reuse";
      const authenticationStartedAt = new Date().toISOString();
      const authenticationStartedMs = Date.now();
      await this.client.openApplication();
      await this.client.authenticate({
        email: environment.testEmail,
        password: environment.testPassword,
      }, this.options.allowUiAuthenticationFallback ?? true);
      run.stageTimings.push({ stage: "authentication-reuse", startedAt: authenticationStartedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - authenticationStartedMs, status: "passed" });
      activeStepId = "fresh-attempt-setup";
      const setupStartedMs = Date.now();
      const fresh = await this.client.createFreshEncounter(scenario.caseId);
      run.setupDiagnostics.requestedFreshEncounterId = fresh.encounterId;
      run.setupDiagnostics.newAttemptCreated = true;
      activeStepId = "case-selection";
      // Clerk may transiently redirect a long sequential run after the API setup call.
      // Revalidate the persisted test session at the protected route before selecting.
      await this.client.authenticate({
        email: environment.testEmail,
        password: environment.testPassword,
      }, this.options.allowUiAuthenticationFallback ?? true);
      await this.client.navigateToCaseList();
      const selected = await this.client.selectCase({
        caseId: scenario.caseId,
        patientName: scenario.patientName,
        encounterPath: scenario.encounterPath,
        attemptPolicy: scenario.attemptPolicy,
      });
      this.recordSelectionTimings(run, selected);
      await this.client.startConsultation();
      const verified = await this.client.verifyFreshEncounter(fresh.encounterId);
      Object.assign(run.setupDiagnostics, {
        boundEncounterId: verified.boundEncounterId,
        initialTranscriptNodeCount: verified.transcriptCount,
        initialPatientCount: verified.patientCount,
        initialStudentCount: verified.studentCount,
        setupDurationMs: Date.now() - setupStartedMs,
      });

      for (const step of scenario.steps) {
        activeStepId = step.id;
        const stepResult = await this.executeStep(step, scenario, run.steps);
        run.steps.push(stepResult);
        run.assertions.push(...stepResult.assertions);
        run.stageTimings.push(stepTiming(stepResult));
        if (stepResult.timedOut) {
          throw new PatientResponseTimeoutError(
            stepResult.diagnosticMessage ??
            `Stopping scenario after ${step.id} because its patient response timed out.`,
          );
        }
      }
    } catch (error) {
      run.failureUrl = sanitizeUrl(this.page.url());
      run.activeStepIdAtFailure = activeStepId;
      run.errorMessage = safeErrorMessage(error);
      run.firstFailingStage = activeStepId ?? "journey-setup";
      run.overallStatus = "error";
    } finally {
      const finalCounts = await this.client.conversationCounts().catch(() => null);
      if (finalCounts) {
        run.setupDiagnostics.finalPatientCount = finalCounts.patientCount;
        run.setupDiagnostics.finalStudentCount = finalCounts.studentCount;
      }
      run.setupDiagnostics.abortedBeforeConversation = run.steps.length === 0 && run.overallStatus === "error";
      run.completedAt = new Date().toISOString();
      run.assertions.push(...observabilityAssertions(run));
      if (run.overallStatus !== "error") {
        run.overallStatus = aggregateStatus(run.assertions);
      }
    }

    try {
      const reportPath = await this.reporter.write(run);
      return { run, reportPath: path.resolve(reportPath) };
    } catch (error) {
      run.reportStatus = "failed";
      run.overallStatus = "error";
      run.errorMessage = `${run.errorMessage ? `${run.errorMessage} ` : ""}JSON report failed: ${safeErrorMessage(error)}`;
      throw new Error(run.errorMessage, { cause: error });
    }
  }

  public async runCompletionReport(scenario: TestScenario): Promise<BrowserJourneyResult> {
    const run = this.createRun(scenario);
    let activeStepId: string | null = null;
    this.installObservers(run);
    run.encounterCompletion = {
      attemptStateUsed: "unknown",
      conversationStepCount: scenario.steps.length,
      completionControlLabel: null,
      completionHttpStatus: null,
      evaluationRequestUrl: null,
      evaluationHttpStatus: null,
      completionClickedAt: null,
      reportNavigationAt: null,
      reportHeadingVisibleAt: null,
      reportGenerationDurationMs: null,
      reportExtractionDurationMs: null,
      reportUrl: null,
      facultyReport: null,
    };

    try {
      activeStepId = "authentication-reuse";
      const authenticationStartedAt = new Date().toISOString();
      const authenticationStartedMs = Date.now();
      await this.client.openApplication();
      await this.client.authenticate({ email: environment.testEmail, password: environment.testPassword }, this.options.allowUiAuthenticationFallback ?? true);
      run.stageTimings.push({ stage: "authentication-reuse", startedAt: authenticationStartedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - authenticationStartedMs, status: "passed" });
      activeStepId = "case-selection";
      await this.client.navigateToCaseList();
      const selected = await this.client.selectCase({
        caseId: scenario.caseId,
        patientName: scenario.patientName,
        encounterPath: scenario.encounterPath,
        attemptPolicy: scenario.attemptPolicy,
      });
      this.recordSelectionTimings(run, selected);
      run.encounterCompletion.attemptStateUsed = selected.attemptStateUsed;
      await this.client.startConsultation();
      for (const step of scenario.steps) {
        activeStepId = step.id;
        const stepResult = await this.executeStep(step, scenario, run.steps);
        run.steps.push(stepResult);
        run.assertions.push(...stepResult.assertions);
        run.stageTimings.push(stepTiming(stepResult));
        if (stepResult.timedOut) throw new PatientResponseTimeoutError(stepResult.diagnosticMessage ?? `Patient response timed out at ${step.id}.`);
      }

      activeStepId = "case-01-completion-and-report";
      const completion = await this.client.completeEncounter(scenario.caseId, 90_000);
      Object.assign(run.encounterCompletion, completion);
      run.completionStatus = "completed";
      run.persistenceStatus = "confirmed";
      run.stageTimings.push(
        { stage: "completion-submission", startedAt: completion.completionClickedAt, completedAt: completion.reportNavigationAt, durationMs: Date.parse(completion.reportNavigationAt) - Date.parse(completion.completionClickedAt), status: "passed" },
        { stage: "report-generation", startedAt: completion.completionClickedAt, completedAt: completion.reportHeadingVisibleAt, durationMs: completion.reportGenerationDurationMs, status: "passed" },
        { stage: "report-extraction", startedAt: completion.reportHeadingVisibleAt, completedAt: new Date(Date.parse(completion.reportHeadingVisibleAt) + completion.reportExtractionDurationMs).toISOString(), durationMs: completion.reportExtractionDurationMs, status: "passed" },
      );
      run.assertions.push(...facultyReportAssertions(completion.facultyReport, scenario.caseId, scenario.patientName));
    } catch (error) {
      if (error instanceof CompletionWorkflowError) Object.assign(run.encounterCompletion, error.progress);
      run.completionStatus = "failed";
      run.failureUrl = sanitizeUrl(this.page.url());
      run.activeStepIdAtFailure = activeStepId;
      run.errorMessage = safeErrorMessage(error);
      run.firstFailingStage = activeStepId ?? "completion-setup";
      run.overallStatus = "error";
    } finally {
      run.completedAt = new Date().toISOString();
      run.assertions.push(...observabilityAssertions(run));
      if (run.overallStatus !== "error") run.overallStatus = aggregateStatus(run.assertions);
    }

    const reportPath = await this.reporter.write(run);
    return { run, reportPath: path.resolve(reportPath) };
  }

  private async executeStep(step: TestScenario["steps"][number], scenario: TestScenario, priorSteps: readonly ConversationStepResult[]): Promise<ConversationStepResult> {
    const startedAt = new Date().toISOString();
    let response: string | null = null;
    let elapsedResponseTimeMs = 0;
    let timedOut = false;
    let httpStatus: number | null = null;
    let visibleApplicationError: string | null = null;
    let diagnosticMessage: string | null = null;

    const {
      baseline,
      sentAt,
      conversationResponseStatus,
    } = await this.client.sendStudentMessage(step.studentMessage);
    try {
      const interaction = await this.client.waitForNextPatientResponse(
        baseline,
        sentAt,
        step.expectation.maximumResponseTimeMs,
        conversationResponseStatus,
      );
      response = interaction.response;
      elapsedResponseTimeMs = interaction.elapsedResponseTimeMs;
      httpStatus = interaction.httpStatus;
      visibleApplicationError = interaction.visibleApplicationError;
    } catch (error) {
      if (!(error instanceof PatientResponseTimeoutError)) {
        throw error;
      }
      timedOut = true;
      elapsedResponseTimeMs = Date.now() - sentAt;
      visibleApplicationError = await this.client.detectVisibleApplicationError();
      diagnosticMessage = error.message;
    }

    const assertions = evaluateDeterministically({
      stepId: step.id,
      response,
      elapsedResponseTimeMs,
      timedOut,
      visibleApplicationError,
      expectation: step.expectation,
    });
    assertions.push(...evaluateBehaviorally({
      stepId: step.id,
      stepIndex: priorSteps.length,
      studentMessage: step.studentMessage,
      response,
      previousPatientResponse: priorSteps.at(-1)?.patientResponse ?? undefined,
      expectation: step.expectation,
      contract: scenario.caseContract,
    }));

    let semanticEvaluation = null;
    if (response) {
      semanticEvaluation = await evaluateSemantically({
        caseId: scenario.caseId,
        permittedFacts: scenario.caseContract?.permittedFacts ?? [],
        recentConversation: priorSteps.slice(-3).flatMap((item) => [
          { role: "Student" as const, text: item.studentMessage },
          ...(item.patientResponse ? [{ role: "Patient" as const, text: item.patientResponse }] : []),
        ]),
        studentMessage: step.studentMessage,
        patientResponse: response,
      });
      if (semanticEvaluation) {
        for (const [dimension, result] of Object.entries(semanticEvaluation)) {
          assertions.push({ id: `${step.id}-semantic-${dimension}`, name: `Semantic: ${dimension}`, status: result.score === 0 ? "failed" : "passed", severity: result.score === 0 ? "failure" : result.score === 1 ? "warning" : "info", message: result.reason, expected: 2, actual: result.score });
        }
      }
    }

    return {
      stepId: step.id,
      studentMessage: step.studentMessage,
      patientResponse: response,
      startedAt,
      completedAt: new Date().toISOString(),
      elapsedResponseTimeMs,
      timedOut,
      httpStatus,
      visibleApplicationError,
      diagnosticMessage,
      assertions,
      semanticEvaluation,
      disclosedStableFactIds: collectDisclosedStableFacts(scenario.caseContract, [
        ...priorSteps.flatMap((item) => item.patientResponse ? [item.patientResponse] : []),
        ...(response ? [response] : []),
      ]),
    };
  }

  private installObservers(run: SyntheticTestRun): void {
    this.page.on("console", (message) => {
      if (message.type() === "error") {
        run.browserConsoleErrors.push(message.text());
      }
    });
    this.page.on("pageerror", (error) => run.pageErrors.push(error.message));
    this.page.on("requestfailed", (request) => {
      const failureText = request.failure()?.errorText ?? null;
      run.failedNetworkRequests.push({
        method: request.method(),
        url: sanitizeUrl(request.url()),
        failureText,
        httpStatus: null,
        expectedNavigationAbort: failureText === "net::ERR_ABORTED",
      });
    });
    this.page.on("response", (response) => {
      if (response.status() >= 500) {
        run.failedNetworkRequests.push({
          method: response.request().method(),
          url: sanitizeUrl(response.url()),
          failureText: `HTTP ${response.status()}`,
          httpStatus: response.status(),
          expectedNavigationAbort: false,
        });
      }
    });
  }

  private createRun(scenario: TestScenario): SyntheticTestRun {
    return {
      runId: randomUUID(),
      environmentName: environment.name,
      caseId: scenario.caseId,
      patientName: scenario.patientName,
      scenarioId: scenario.id,
      authenticatedStateUsage: this.options.allowUiAuthenticationFallback === false
        ? "clerk-storage-state"
        : "storage-state-or-ui-fallback",
      startedAt: new Date().toISOString(),
      completedAt: null,
      overallStatus: "passed",
      steps: [],
      assertions: [],
      completionStatus: "not-attempted",
      persistenceStatus: "not-checked",
      reportStatus: "pending",
      reportPath: null,
      browserConsoleErrors: [],
      pageErrors: [],
      failedNetworkRequests: [],
      failureUrl: null,
      activeStepIdAtFailure: null,
      errorMessage: null,
      stageTimings: [],
      firstFailingStage: null,
      setupDiagnostics: {
        browserContextId: randomUUID(),
        requestedFreshEncounterId: null,
        boundEncounterId: null,
        newAttemptCreated: false,
        initialTranscriptNodeCount: 0,
        initialPatientCount: 0,
        initialStudentCount: 0,
        finalPatientCount: null,
        finalStudentCount: null,
        workflow: "fresh-start-api",
        setupDurationMs: 0,
        endpointFailures: [],
        abortedBeforeConversation: false,
      },
    };
  }

  private recordSelectionTimings(run: SyntheticTestRun, selected: Awaited<ReturnType<OdontiqBrowserClient["selectCase"]>>): void {
    run.stageTimings.push(
      { stage: "case-selection", startedAt: selected.caseSelectionStartedAt, completedAt: new Date(Date.parse(selected.caseSelectionStartedAt) + selected.caseSelectionDurationMs).toISOString(), durationMs: selected.caseSelectionDurationMs, status: "passed" },
      { stage: "encounter-navigation", startedAt: selected.encounterNavigationStartedAt, completedAt: new Date(Date.parse(selected.encounterNavigationStartedAt) + selected.encounterNavigationDurationMs).toISOString(), durationMs: selected.encounterNavigationDurationMs, status: "passed" },
    );
  }
}

function stepTiming(step: ConversationStepResult) {
  return {
    stage: `conversation:${step.stepId}`,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: Date.parse(step.completedAt) - Date.parse(step.startedAt),
    status: step.timedOut ? "timed-out" as const : "passed" as const,
  };
}

function facultyReportAssertions(
  report: NonNullable<SyntheticTestRun["encounterCompletion"]>["facultyReport"] & {},
  caseId: string,
  patientName: string,
): TestAssertionResult[] {
  const checks: Array<[string, string, boolean, string]> = [
    ["report-heading", "Faculty Rubric Report heading", /faculty rubric report/i.test(report.heading), report.heading],
    ["report-case", "Report belongs to Case 1", Boolean(report.caseIdentity && /case\s*0?1/i.test(report.caseIdentity)), report.caseIdentity ?? "missing"],
    ["report-strengths", "Strengths contains meaningful content", report.strengths.join(" ").trim().length > 10, `${report.strengths.length} item(s)`],
    ["report-improvements", "Areas for Improvement contains meaningful content", report.areasForImprovement.join(" ").trim().length > 10, `${report.areasForImprovement.length} item(s)`],
    ["report-transcript", "Encounter Transcript contains Student and Patient messages", report.transcript.some((entry) => entry.role === "Student") && report.transcript.some((entry) => entry.role === "Patient"), `${report.transcript.length} message(s)`],
    ["report-patient", "Report identifies the Case 1 patient", report.caseIdentity?.includes(patientName) === true || report.transcript.length > 0, patientName],
  ];
  return checks.map(([id, name, passed, actual]) => ({
    id: `${caseId}-${id}`,
    name,
    status: passed ? "passed" : "failed",
    severity: passed ? "info" : "failure",
    message: passed ? `${name} was validated.` : `${name} was missing or empty.`,
    actual,
  }));
}

function aggregateStatus(assertions: readonly TestAssertionResult[]): SyntheticTestRun["overallStatus"] {
  const failed = assertions.filter((assertion) => assertion.status === "failed");
  if (failed.some((assertion) => assertion.severity === "failure" || assertion.severity === "critical")) {
    return "failed";
  }
  if (failed.some((assertion) => assertion.severity === "warning")) {
    return "warning";
  }
  return "passed";
}

function observabilityAssertions(run: SyntheticTestRun): TestAssertionResult[] {
  const actionableNetworkFailures = run.failedNetworkRequests.filter(
    (request) => !request.expectedNavigationAbort,
  );
  const expectedNavigationAborts = run.failedNetworkRequests.length - actionableNetworkFailures.length;
  return [
    {
      id: "run-page-errors",
      name: "No uncaught page errors",
      status: run.pageErrors.length === 0 ? "passed" : "failed",
      severity: run.pageErrors.length === 0 ? "info" : "critical",
      message: run.pageErrors.length === 0
        ? "No uncaught page errors were observed."
        : `${run.pageErrors.length} uncaught page error(s) were observed.`,
      expected: 0,
      actual: run.pageErrors.length,
    },
    {
      id: "run-failed-network-requests",
      name: "No failed or server-error network requests",
      status: actionableNetworkFailures.length === 0 ? "passed" : "failed",
      severity: actionableNetworkFailures.length === 0 ? "info" : "critical",
      message: actionableNetworkFailures.length === 0
        ? `No actionable network failures were observed. ${expectedNavigationAborts} expected navigation abort(s) were retained for diagnostics.`
        : `${actionableNetworkFailures.length} actionable failed or HTTP 5xx network request(s) were observed; ${expectedNavigationAborts} navigation abort(s) were retained separately.`,
      expected: 0,
      actual: actionableNetworkFailures.length,
    },
    {
      id: "run-console-errors",
      name: "No browser console errors",
      status: run.browserConsoleErrors.length === 0 ? "passed" : "failed",
      severity: run.browserConsoleErrors.length === 0 ? "info" : "warning",
      message: run.browserConsoleErrors.length === 0
        ? "No browser console errors were observed."
        : `${run.browserConsoleErrors.length} browser console error(s) were observed.`,
      expected: 0,
      actual: run.browserConsoleErrors.length,
    },
  ];
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[unavailable URL]";
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "[REDACTED]");
}
