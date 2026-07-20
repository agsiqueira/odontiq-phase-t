import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Page } from "@playwright/test";
import { environment } from "../config/environment.js";
import {
  OdontiqBrowserClient,
  PatientResponseTimeoutError,
} from "../clients/odontiqBrowserClient.js";
import { evaluateDeterministically } from "../evaluators/deterministicEvaluator.js";
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
      await this.client.openApplication();
      await this.client.authenticate({
        email: environment.testEmail,
        password: environment.testPassword,
      }, this.options.allowUiAuthenticationFallback ?? true);
      await this.client.navigateToCaseList();
      await this.client.selectCase({
        caseId: scenario.caseId,
        patientName: scenario.patientName,
        encounterPath: scenario.encounterPath,
      });
      await this.client.startConsultation();

      for (const step of scenario.steps) {
        activeStepId = step.id;
        const stepResult = await this.executeStep(step);
        run.steps.push(stepResult);
        run.assertions.push(...stepResult.assertions);
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
      run.overallStatus = "error";
    } finally {
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

  private async executeStep(step: TestScenario["steps"][number]): Promise<ConversationStepResult> {
    const startedAt = new Date().toISOString();
    let response: string | null = null;
    let elapsedResponseTimeMs = 0;
    let timedOut = false;
    let httpStatus: number | null = null;
    let visibleApplicationError: string | null = null;
    let diagnosticMessage: string | null = null;

    const {
      previousPatientMessageCount,
      previousLastPatientMessageText,
      sentAt,
      conversationResponseStatus,
    } = await this.client.sendStudentMessage(step.studentMessage);
    try {
      const interaction = await this.client.waitForNextPatientResponse(
        previousPatientMessageCount,
        previousLastPatientMessageText,
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
    };
  }
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
