import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { authenticateClerkTestSession, type ClerkCredentials } from "../auth/clerkTestSession.js";
import { selectors, type ConversationRole } from "../config/selectors.js";
import type {
  AttemptStateUsed,
  FacultyReportResult,
  FacultyReportTranscriptEntry,
} from "../types/testResult.js";
import { isNewerThanBaseline, retainNewerState, type LatestMessageState, type MessageBaseline } from "./messageBaseline.js";

export class OdontiqBrowserInteractionError extends Error {
  public constructor(
    message: string,
    public readonly operation: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OdontiqBrowserInteractionError";
  }
}

function sanitizeBrowserUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class PatientResponseTimeoutError extends OdontiqBrowserInteractionError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, "wait-for-patient-response", options);
    this.name = "PatientResponseTimeoutError";
  }
}

export interface PatientInteractionResult {
  response: string;
  elapsedResponseTimeMs: number;
  httpStatus: number | null;
  visibleApplicationError: string | null;
}

export interface CaseSelection {
  caseId: string;
  patientName: string;
  encounterPath: string;
  attemptPolicy?: "resume" | "prefer-new" | "require-new" | "reuse-completed-report";
}

export interface SelectedCaseResult {
  attemptStateUsed: AttemptStateUsed;
  actionLabel: string;
  caseSelectionStartedAt: string;
  caseSelectionDurationMs: number;
  encounterNavigationStartedAt: string;
  encounterNavigationDurationMs: number;
}

export interface CompletedEncounterResult {
  completionControlLabel: string;
  completionHttpStatus: number | null;
  evaluationRequestUrl: string | null;
  evaluationHttpStatus: number | null;
  completionClickedAt: string;
  reportNavigationAt: string;
  reportHeadingVisibleAt: string;
  reportGenerationDurationMs: number;
  reportExtractionDurationMs: number;
  reportUrl: string;
  facultyReport: FacultyReportResult;
}

export class CompletionWorkflowError extends OdontiqBrowserInteractionError {
  public constructor(message: string, public readonly progress: Partial<CompletedEncounterResult>, options?: ErrorOptions) {
    super(message, "complete-encounter", options);
    this.name = "CompletionWorkflowError";
  }
}

interface ConversationSnapshot {
  count: number;
  messages: string[];
  lastText: string | null;
}

interface SentStudentMessage {
  baseline: MessageBaseline;
  sentAt: number;
  conversationResponseStatus: Promise<number | null>;
}

export interface FreshEncounterSetup {
  encounterId: string;
  endpointStatus: number;
}

export class OdontiqBrowserClient {
  public constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  public async openApplication(): Promise<void> {
    const response = await this.page.goto(this.baseUrl);
    if (response && response.status() >= 500) {
      throw new OdontiqBrowserInteractionError(
        `OdontIQ returned HTTP ${response.status()} while opening ${this.baseUrl}.`,
        "open-application",
      );
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    const marker = selectors.authenticatedMarker(this.page);
    const markerCount = await marker.count();
    for (let index = 0; index < markerCount; index += 1) {
      if (await marker.nth(index).isVisible().catch(() => false)) {
        return true;
      }
    }

    const path = new URL(this.page.url()).pathname;
    const isProtectedRoute = /^\/(home|cases)(?:\/|$)/i.test(path);
    if (!isProtectedRoute) {
      return false;
    }

    const emailVisible = await selectors.clerkEmailInput(this.page).first().isVisible().catch(() => false);
    const signInVisible = await selectors.signInButton(this.page).first().isVisible().catch(() => false);
    return !emailVisible && !signInVisible;
  }

  public async authenticate(
    credentials: ClerkCredentials,
    allowUiAuthenticationFallback = true,
  ): Promise<void> {
    if (await this.isAuthenticated()) {
      return;
    }

    if (!allowUiAuthenticationFallback) {
      const protectedCasesUrl = new URL("/cases", this.baseUrl).toString();
      const response = await this.page.goto(protectedCasesUrl);
      if (response && response.status() < 400 && await this.isAuthenticated()) {
        return;
      }

      throw new OdontiqBrowserInteractionError(
        `The configured Clerk storage state could not access the protected /cases route and reached ${this.page.url()}. Run npm run test:auth-setup and verify that playwright/.clerk/user.json was created from the same Clerk development instance as OdontIQ.`,
        "authenticate-storage-state",
      );
    }

    await authenticateClerkTestSession(this.page, credentials, () => this.isAuthenticated());
  }

  public async navigateToCaseList(): Promise<void> {
    if (/^\/cases(?:\/|$)/i.test(new URL(this.page.url()).pathname)) {
      return;
    }

    const caseListLink = selectors.caseListLink(this.page).first();
    try {
      if (await caseListLink.isVisible().catch(() => false)) {
        await caseListLink.click();
      } else {
        await this.page.goto(new URL("/cases", this.baseUrl).toString(), {
          waitUntil: "domcontentloaded",
        });
      }
    } catch (error) {
      throw this.interactionError("Could not navigate to the case list. Verify caseListLink.", "navigate-case-list", error);
    }
  }

  public async createFreshEncounter(caseId: string): Promise<FreshEncounterSetup> {
    const result = await this.page.evaluate(async (targetCaseId) => {
      sessionStorage.clear();
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && /encounter|attempt|selected.?case/i.test(key)) localStorage.removeItem(key);
      }
      const response = await fetch("/api/encounters/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: targetCaseId, fresh: true }),
      });
      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      return { status: response.status, id: typeof body?.id === "string" ? body.id : null };
    }, caseId);
    if (result.status >= 400 || !result.id) {
      throw new OdontiqBrowserInteractionError(`Fresh encounter creation failed with HTTP ${result.status}.`, "fresh-encounter");
    }
    return { encounterId: result.id, endpointStatus: result.status };
  }

  public async verifyFreshEncounter(expectedEncounterId: string, maximumInitialMessages = 6) {
    const root = selectors.encounterRoot(this.page).first();
    await expect.poll(() => root.getAttribute("data-server-encounter-id"), {
      timeout: 15_000,
      message: "Waiting for the encounter page to bind the fresh server encounter",
    }).toBe(expectedEncounterId);
    const boundEncounterId = await root.getAttribute("data-server-encounter-id");
    const patientCount = await selectors.conversationMessageGroups(this.page, "Patient").count();
    const studentCount = await selectors.conversationMessageGroups(this.page, "Student").count();
    const transcriptCount = patientCount + studentCount;
    if (transcriptCount > maximumInitialMessages) {
      throw new OdontiqBrowserInteractionError(
        `Fresh-attempt isolation failed: initial transcript has ${transcriptCount} nodes (Patient ${patientCount}, Student ${studentCount}), above the safe bound ${maximumInitialMessages}.`,
        "verify-fresh-encounter",
      );
    }
    return { boundEncounterId, patientCount, studentCount, transcriptCount };
  }

  public async conversationCounts() {
    const [patientCount, studentCount] = await Promise.all([
      selectors.conversationMessageGroups(this.page, "Patient").count(),
      selectors.conversationMessageGroups(this.page, "Student").count(),
    ]);
    return { patientCount, studentCount };
  }

  public async selectCase(selection: CaseSelection): Promise<SelectedCaseResult> {
    const { caseId, patientName, encounterPath } = selection;
    try {
      if (selection.attemptPolicy === "prefer-new" || selection.attemptPolicy === "require-new") {
        await this.clearIncompleteTestSnapshot(caseId);
        await this.page.reload({ waitUntil: "domcontentloaded" });
      }
      const caseSelectionStartedAt = new Date().toISOString();
      const caseSelectionStartedMs = Date.now();
      const cards = selectors.caseCard(this.page, caseId, patientName);
      await cards.first().waitFor({ state: "visible" });
      const cardCount = await cards.count();
      if (cardCount !== 1) {
        throw new Error(`Expected one patient card for ${caseId}, found ${cardCount}.`);
      }

      const caseCard = cards.first();
      const actions = selectors.caseAction(caseCard, encounterPath);
      const actionCount = await actions.count();
      if (actionCount !== 1) {
        throw new Error(`Expected one Start, Resume, or Restart Case action, found ${actionCount}.`);
      }

      const action = actions.first();
      if (!(await action.isVisible())) {
        throw new Error("The scoped case action exists but is hidden.");
      }
      if (!(await action.isEnabled())) {
        throw new Error("The scoped case action exists but is disabled.");
      }

      const actionText = (await action.innerText()).trim();
      const actionLabel = actionText.match(/(?:start|resume|restart|retry) case/i)?.[0] ?? actionText;
      const caseSelectionDurationMs = Date.now() - caseSelectionStartedMs;
      const encounterNavigationStartedAt = new Date().toISOString();
      const encounterNavigationStartedMs = Date.now();
      await action.click();
      await this.page.waitForURL(selectors.caseEncounterUrlPattern(encounterPath), { timeout: 15_000 });
      if (!selectors.caseEncounterUrlPattern(encounterPath).test(this.page.url())) {
        throw new Error(`The case action opened a different route: ${this.page.url()}.`);
      }
      await selectors.caseEncounterMarker(this.page, caseId, patientName).first().waitFor({ state: "visible" });
      return {
        actionLabel,
        attemptStateUsed: /^start case$/i.test(actionLabel)
          ? "started"
          : /^resume case$/i.test(actionLabel)
            ? "resumed"
            : /^(?:restart|retry) case$/i.test(actionLabel)
              ? "restarted"
              : "unknown",
        caseSelectionStartedAt,
        caseSelectionDurationMs,
        encounterNavigationStartedAt,
        encounterNavigationDurationMs: Date.now() - encounterNavigationStartedMs,
      };
    } catch (error) {
      const diagnostics = await this.collectCaseSelectionDiagnostics(selection);
      throw this.interactionError(
        `Could not select ${caseId}. ${diagnostics}`,
        "select-case",
        error,
      );
    }
  }

  private async clearIncompleteTestSnapshot(caseId: string): Promise<void> {
    await this.page.evaluate((targetCaseId) => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.endsWith(":encounterSnapshots") && key !== "odontiq:encounterSnapshots") continue;
        try {
          const snapshots = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
          if (!(targetCaseId in snapshots)) continue;
          delete snapshots[targetCaseId];
          localStorage.setItem(key, JSON.stringify(snapshots));
        } catch {
          // Leave malformed or unrelated browser storage untouched.
        }
      }
    }, caseId);
  }

  public async startConsultation(): Promise<void> {
    if (await selectors.messageInput(this.page).first().isVisible().catch(() => false)) {
      return;
    }

    try {
      await selectors.startConsultationButton(this.page).first().click();
      await selectors.messageInput(this.page).first().waitFor({ state: "visible" });
    } catch (error) {
      throw this.interactionError("Could not start or restart the consultation. Verify consultation selectors.", "start-consultation", error);
    }
  }

  public async sendStudentMessage(message: string): Promise<SentStudentMessage> {
    const baselineState = await this.readLatestConversationMessage("Patient");
    const baseline: MessageBaseline = {
      patientMessageCount: baselineState.count,
      lastPatientText: baselineState.text,
      lastPatientContainerIdentity: baselineState.containerIdentity,
      capturedAt: new Date().toISOString(),
    };
    try {
      await selectors.messageInput(this.page).first().fill(message);
      const conversationResponseStatus = this.page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return response.request().method() === "POST" && url.pathname === "/api/conversation";
        },
        { timeout: 30_000 },
      ).then((response) => response.status()).catch(() => null);
      const sentAt = Date.now();
      await selectors.sendButton(this.page).first().click();
      return {
        baseline,
        sentAt,
        conversationResponseStatus,
      };
    } catch (error) {
      throw this.interactionError("Could not send the student message. Verify encounter input and send selectors.", "send-message", error);
    }
  }

  public async waitForNextPatientResponse(
    baseline: MessageBaseline,
    sentAt: number,
    timeoutMs: number,
    conversationResponseStatus: Promise<number | null>,
  ): Promise<PatientInteractionResult> {
    let latest = await this.readLatestConversationMessage("Patient");
    try {
      await expect.poll(async () => {
        latest = await this.readLatestConversationMessage("Patient");
        return isNewerThanBaseline(baseline, latest);
      }, {
        message: "Waiting for a new role-scoped Patient message group",
        timeout: timeoutMs,
        intervals: [100, 250, 500],
      }).toBe(true);

      // A stable value across consecutive polls is used as a generic streaming
      // completion signal until OdontIQ exposes an explicit response-complete marker.
      let accepted = latest;
      let previousText = accepted.text ?? "";
      let stablePolls = 0;
      await expect.poll(async () => {
        const candidate = await this.readLatestConversationMessage("Patient");
        accepted = retainNewerState(baseline, accepted, candidate);
        const currentText = accepted.text ?? "";
        stablePolls = currentText.length > 0 && currentText === previousText ? stablePolls + 1 : 0;
        previousText = currentText;
        return stablePolls;
      }, { timeout: 5_000, intervals: [250, 500, 750] }).toBeGreaterThanOrEqual(2);

      return {
        response: previousText,
        elapsedResponseTimeMs: Date.now() - sentAt,
        httpStatus: await conversationResponseStatus,
        visibleApplicationError: await this.detectVisibleApplicationError(),
      };
    } catch (error) {
      const postSendSnapshot = await this.readConversationSnapshot("Patient", 20);
      const status = await conversationResponseStatus;
      const diagnostics = await this.collectPatientResponseDiagnostics(
        baseline.patientMessageCount,
        postSendSnapshot,
        status,
      );
      throw new PatientResponseTimeoutError(
        `No new complete role-scoped Patient response appeared within ${timeoutMs} ms. ${diagnostics}`,
        { cause: error },
      );
    }
  }

  public async detectVisibleApplicationError(): Promise<string | null> {
    const errors = selectors.visibleApplicationErrors(this.page);
    const count = await errors.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = errors.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return (await candidate.innerText()).trim();
      }
    }
    return null;
  }

  public async completeEncounter(caseId: string, timeoutMs = 90_000): Promise<CompletedEncounterResult> {
    const control = selectors.finishConsultationButton(this.page).first();
    const encounterUrl = this.page.url();
    const progress: Partial<CompletedEncounterResult> = {};
    let startedAt: number | null = null;
    try {
      await control.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await control.isEnabled())) throw new Error("The completion control is disabled.");
      const completionControlLabel = (await control.innerText()).trim();
      const completionClickedAt = new Date().toISOString();
      startedAt = Date.now();
      progress.completionControlLabel = completionControlLabel;
      progress.completionClickedAt = completionClickedAt;
      const completionResponse = this.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST" && /\/api\/encounters\/[^/]+\/complete$/.test(url.pathname);
      }, { timeout: timeoutMs });
      const encounterPatch = this.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "PATCH" && /\/api\/encounters\/[^/]+$/.test(url.pathname);
      }, { timeout: timeoutMs }).catch(() => null);

      await control.click();
      const evaluationResponse = await completionResponse;
      const patchResponse = await encounterPatch;
      progress.completionHttpStatus = patchResponse?.status() ?? null;
      progress.evaluationRequestUrl = sanitizeBrowserUrl(evaluationResponse.url());
      progress.evaluationHttpStatus = evaluationResponse.status();
      if (evaluationResponse.status() >= 400) {
        throw new Error(`Encounter completion API returned HTTP ${evaluationResponse.status()}.`);
      }
      await this.page.waitForURL(new RegExp(`/mentor/${caseId}(?:[?#]|$)`, "i"), { timeout: timeoutMs });
      const reportNavigationAt = new Date().toISOString();
      progress.reportNavigationAt = reportNavigationAt;

      const reportError = selectors.reportErrorMarker(this.page).first();
      await expect.poll(async () => {
        if (await reportError.isVisible().catch(() => false)) return "error";
        if (!(await selectors.completionLoadingMarker(this.page).first().isVisible().catch(() => false))) return "ready";
        return "loading";
      }, { timeout: timeoutMs, intervals: [500, 1_000, 2_000] }).not.toBe("loading");
      if (await reportError.isVisible().catch(() => false)) {
        throw new Error((await reportError.innerText()).trim());
      }

      const viewReport = selectors.viewFacultyReportLink(this.page).first();
      await viewReport.waitFor({ state: "visible", timeout: 30_000 });
      await viewReport.click();
      progress.reportUrl = sanitizeBrowserUrl(this.page.url());
      const heading = selectors.facultyReportHeading(this.page).first();
      await expect.poll(async () => {
        if (await heading.isVisible().catch(() => false)) return "ready";
        if (await reportError.isVisible().catch(() => false)) return "error";
        return "loading";
      }, { timeout: timeoutMs, intervals: [250, 500, 1_000] }).not.toBe("loading");
      if (await reportError.isVisible().catch(() => false)) {
        throw new Error((await reportError.innerText()).trim());
      }
      const reportHeadingVisibleAt = new Date().toISOString();
      progress.reportHeadingVisibleAt = reportHeadingVisibleAt;
      progress.reportGenerationDurationMs = Date.now() - startedAt;
      const extractionStartedAt = Date.now();
      const facultyReport = await this.extractFacultyReport();
      const reportExtractionDurationMs = Date.now() - extractionStartedAt;
      return {
        completionControlLabel,
        completionHttpStatus: patchResponse?.status() ?? null,
        evaluationRequestUrl: sanitizeBrowserUrl(evaluationResponse.url()),
        evaluationHttpStatus: evaluationResponse.status(),
        completionClickedAt,
        reportNavigationAt,
        reportHeadingVisibleAt,
        reportGenerationDurationMs: progress.reportGenerationDurationMs,
        reportExtractionDurationMs,
        reportUrl: sanitizeBrowserUrl(this.page.url()),
        facultyReport,
      };
    } catch (error) {
      progress.reportUrl = sanitizeBrowserUrl(this.page.url());
      if (startedAt !== null) progress.reportGenerationDurationMs = Date.now() - startedAt;
      throw new CompletionWorkflowError(
        `Encounter completion/report validation failed: ${error instanceof Error ? error.message : String(error)} Encounter URL before submission: ${encounterUrl}. Candidate controls: ${(await this.page.getByRole("button").allInnerTexts().catch(() => [])).join(" | ") || "[none]"}. Current URL: ${this.page.url()}`,
        progress,
        { cause: error },
      );
    }
  }

  private async extractFacultyReport(): Promise<FacultyReportResult> {
    const section = async (label: RegExp): Promise<string[]> => {
      const heading = selectors.reportSectionHeading(this.page, label).first();
      if (!(await heading.isVisible().catch(() => false))) return [];
      const details = heading.locator("xpath=ancestor::details[1]");
      if (await details.count()) {
        if (!(await details.first().getAttribute("open"))) await heading.click();
      }
      const container = await details.count() ? details.first() : heading.locator("xpath=..");
      const text = (await container.innerText()).replace((await heading.innerText()), "").trim();
      return text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    };
    const toggle = selectors.reportTranscriptToggle(this.page).first();
    if (await toggle.isVisible().catch(() => false)) {
      const transcriptDetails = toggle.locator("xpath=ancestor::details[1]");
      if (await transcriptDetails.count()) {
        if (!(await transcriptDetails.first().getAttribute("open"))) await toggle.click();
      } else if (await toggle.getAttribute("aria-expanded") === "false") {
        await toggle.click();
      }
    }
    const transcript: FacultyReportTranscriptEntry[] = [];
    const transcriptDetails = toggle.locator("xpath=ancestor::details[1]");
    const transcriptRows = transcriptDetails.locator("li");
    for (let index = 0; index < await transcriptRows.count(); index += 1) {
      const paragraphs = transcriptRows.nth(index).locator(":scope > p");
      if (await paragraphs.count() < 2) continue;
      const label = (await paragraphs.first().innerText()).trim();
      const text = (await paragraphs.nth(1).innerText()).trim();
      const role = /^provider(?:\s|·|$)/i.test(label)
        ? "Student"
        : /^patient(?:\s|·|$)/i.test(label)
          ? "Patient"
          : null;
      if (role && text) transcript.push({ role, text, timestamp: label.split("·")[1]?.trim() });
    }
    const body = await this.page.locator("body").innerText();
    const overallBlock = await this.page.getByText(/^overall$/i, { exact: true }).first().locator("xpath=..").innerText().catch(() => "");
    const scoreMatch = overallBlock.match(/(\d+(?:\.\d+)?)\s*%/) ?? body.match(/(?:overall (?:performance|score)|score)\D{0,20}(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?)|%|out of\s*(\d+(?:\.\d+)?))?/i);
    const score = scoreMatch ? Number(scoreMatch[1]) : null;
    const maximum = scoreMatch ? Number(scoreMatch[2] ?? scoreMatch[3]) : Number.NaN;
    if (score !== null && (score < 0 || (Number.isFinite(maximum) && score > maximum))) {
      throw new Error(`The visible score ${score} is outside its displayed range.`);
    }
    const strengths = await section(/^strengths$/i);
    const areasForImprovement = await section(/^areas for improvement$/i);
    return {
      heading: (await selectors.facultyReportHeading(this.page).first().innerText()).trim(),
      caseIdentity: /\/reports\/case-01(?:[/?#]|$)/i.test(this.page.url()) && /Amara Johnson/i.test(body) ? "Case 1 — Amara Johnson" : null,
      studentIdentity: null,
      completedAt: (await section(/^(?:completion|completed)(?: date| at| date\/time)?$/i))[0] ?? null,
      score,
      scoreRange: Number.isFinite(maximum) ? `0-${maximum}` : scoreMatch?.[0] ?? null,
      strengths,
      areasForImprovement,
      transcript,
      sectionPresence: {
        strengths: strengths.length > 0,
        areasForImprovement: areasForImprovement.length > 0,
        encounterTranscript: await selectors.reportSectionHeading(this.page, /encounter transcript/i).first().isVisible().catch(() => false),
        overallPerformance: /overall performance|overall score/i.test(body),
      },
    };
  }

  private interactionError(message: string, operation: string, cause: unknown): OdontiqBrowserInteractionError {
    return new OdontiqBrowserInteractionError(`${message} Current URL: ${this.page.url()}`, operation, { cause });
  }

  private async collectCaseSelectionDiagnostics(selection: CaseSelection): Promise<string> {
    const { caseId, patientName, encounterPath } = selection;
    const visibleTexts = async (locator: ReturnType<Page["locator"]>): Promise<string[]> => {
      const values: string[] = [];
      const count = Math.min(await locator.count(), 20);
      for (let index = 0; index < count; index += 1) {
        const item = locator.nth(index);
        if (await item.isVisible().catch(() => false)) {
          values.push((await item.innerText().catch(() => "[unreadable]")).trim());
        }
      }
      return values;
    };

    const cards = selectors.caseCard(this.page, caseId, patientName);
    const candidateCount = await cards.count().catch(() => 0);
    const candidateText = candidateCount > 0
      ? (await cards.first().innerText().catch(() => "[unreadable]")).trim().slice(0, 1_000)
      : "[none]";
    const actions = candidateCount > 0 ? selectors.caseAction(cards.first(), encounterPath) : null;
    const actionCount = actions ? await actions.count().catch(() => 0) : 0;
    const actionVisible = actions && actionCount === 1
      ? await actions.first().isVisible().catch(() => false)
      : false;
    const actionEnabled = actions && actionCount === 1
      ? await actions.first().isEnabled().catch(() => false)
      : false;
    const screenshotPath = path.resolve(
      "artifacts",
      "screenshots",
      `case-selection-failure-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    );
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

    return [
      `Visible patient names: ${(await visibleTexts(selectors.casePatientHeadings(this.page))).join(" | ") || "[none]"}.`,
      `Visible card actions: ${(await visibleTexts(selectors.visibleCaseActionLabels(this.page))).join(" | ") || "[none]"}.`,
      `Candidate ${patientName} cards: ${candidateCount}.`,
      `Candidate card text: ${candidateText}.`,
      `Scoped action count: ${actionCount}; visible: ${actionVisible}; enabled: ${actionEnabled}.`,
      `Screenshot: ${screenshotPath}.`,
      "Trace: artifacts/traces/browser-case01-happy-path-Case-1-happy-path-browser-journey-authenticated-chromium/trace.zip.",
    ].join(" ");
  }

  private async readLatestConversationMessage(role: ConversationRole): Promise<LatestMessageState> {
    const groups = selectors.conversationMessageGroups(this.page, role);
    const count = await groups.count();
    const lowerBound = Math.max(0, count - 3);
    for (let index = count - 1; index >= lowerBound; index -= 1) {
      const group = groups.nth(index);
      if (!(await group.isVisible().catch(() => false))) continue;
      const testId = await group.getAttribute("data-testid");
      if (!testId && await selectors.conversationGroupRoleLabel(group, role).count() !== 1) continue;
      const text = await this.extractConversationMessageBody(group, role, Boolean(testId));
      if (!text) continue;
      const stableIdentity = await group.getAttribute("data-message-id")
        ?? await group.getAttribute("id")
        ?? `${role.toLowerCase()}-${index}`;
      return { count, text, containerIdentity: stableIdentity };
    }
    return { count };
  }

  private async readConversationSnapshot(role: ConversationRole, maximumMessages = 20): Promise<ConversationSnapshot> {
    const groups = selectors.conversationMessageGroups(this.page, role);
    const messages: string[] = [];
    const groupCount = await groups.count();
    const firstIndex = Math.max(0, groupCount - maximumMessages);
    for (let index = firstIndex; index < groupCount; index += 1) {
      const group = groups.nth(index);
      if (!(await group.isVisible().catch(() => false))) continue;

      const testId = await group.getAttribute("data-testid");
      if (!testId) {
        const exactRoleLabels = selectors.conversationGroupRoleLabel(group, role);
        if (await exactRoleLabels.count() !== 1) continue;
      }

      const message = await this.extractConversationMessageBody(group, role, Boolean(testId));
      if (message) messages.push(message);
    }
    return {
      count: messages.length,
      messages,
      lastText: messages.at(-1) ?? null,
    };
  }

  private async extractConversationMessageBody(
    group: Locator,
    role: ConversationRole,
    stableTestId: boolean,
  ): Promise<string | null> {
    const candidates = selectors.conversationGroupBodyCandidates(group);
    const texts: string[] = [];
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible().catch(() => false))) continue;
      if (await candidate.getAttribute("aria-hidden") === "true") continue;
      const text = (await candidate.innerText()).trim();
      if (!text || text.toLocaleLowerCase() === role.toLocaleLowerCase()) continue;
      if (/^(?:\d{1,2}:\d{2}(?:\s*[ap]m)?|\d+\s+(?:seconds?|minutes?|hours?)\s+ago)$/i.test(text)) continue;
      texts.push(text);
    }

    if (texts.length > 0) {
      return texts.reduce((longest, text) => text.length > longest.length ? text : longest, "");
    }
    if (stableTestId && (await group.evaluate((element) => element.tagName === "P"))) {
      const text = (await group.innerText()).trim();
      return text && text.toLocaleLowerCase() !== role.toLocaleLowerCase() ? text : null;
    }
    return null;
  }

  private async collectPatientResponseDiagnostics(
    preSendPatientCount: number,
    postSendPatientSnapshot: ConversationSnapshot,
    conversationStatus: number | null,
  ): Promise<string> {
    const studentSnapshot = await this.readConversationSnapshot("Student");
    const labels = selectors.conversationRoleLabels(this.page, "Student")
      .or(selectors.conversationRoleLabels(this.page, "Patient"));
    const visibleLabels: string[] = [];
    const labelCount = await labels.count();
    const firstLabelIndex = Math.max(0, labelCount - 20);
    for (let index = firstLabelIndex; index < labelCount; index += 1) {
      const label = labels.nth(index);
      if (await label.isVisible().catch(() => false)) {
        visibleLabels.push((await label.innerText()).trim());
      }
    }
    const screenshotPath = path.resolve(
      "artifacts",
      "screenshots",
      `patient-response-failure-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    );
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

    return [
      `Student groups: ${studentSnapshot.count}.`,
      `Patient groups: ${postSendPatientSnapshot.count}.`,
      `Visible exact role labels: ${visibleLabels.join(" | ") || "[none]"}.`,
      `Candidate Patient texts: ${postSendPatientSnapshot.messages.join(" | ") || "[none]"}.`,
      `Pre-send Patient count: ${preSendPatientCount}; post-send Patient count: ${postSendPatientSnapshot.count}.`,
      `Conversation request status: ${conversationStatus ?? "unobserved"}; successful: ${conversationStatus !== null && conversationStatus < 400}.`,
      `Current URL: ${this.page.url()}.`,
      `Screenshot: ${screenshotPath}.`,
      "Trace: artifacts/traces/browser-case01-happy-path-Case-1-happy-path-browser-journey-authenticated-chromium/trace.zip.",
    ].join(" ");
  }
}
