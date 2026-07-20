import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { authenticateClerkTestSession, type ClerkCredentials } from "../auth/clerkTestSession.js";
import { selectors, type ConversationRole } from "../config/selectors.js";

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

interface ConversationSnapshot {
  count: number;
  messages: string[];
  lastText: string | null;
}

interface SentStudentMessage {
  previousPatientMessageCount: number;
  previousLastPatientMessageText: string | null;
  sentAt: number;
  conversationResponseStatus: Promise<number | null>;
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
      await caseListLink.click();
    } catch (error) {
      throw this.interactionError("Could not navigate to the case list. Verify caseListLink.", "navigate-case-list", error);
    }
  }

  public async selectCase(caseId: string): Promise<void> {
    try {
      const cards = selectors.caseCard(this.page, caseId);
      await cards.first().waitFor({ state: "visible" });
      const cardCount = await cards.count();
      if (cardCount !== 1) {
        throw new Error(`Expected one patient card for ${caseId}, found ${cardCount}.`);
      }

      const caseCard = cards.first();
      const actions = selectors.caseAction(caseCard, caseId);
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

      await action.click();
      await this.page.waitForURL(selectors.caseEncounterUrlPattern(caseId));
      if (!selectors.caseEncounterUrlPattern(caseId).test(this.page.url())) {
        throw new Error(`The case action opened a different route: ${this.page.url()}.`);
      }
      await selectors.caseEncounterMarker(this.page, caseId).first().waitFor({ state: "visible" });
    } catch (error) {
      const diagnostics = await this.collectCaseSelectionDiagnostics(caseId);
      throw this.interactionError(
        `Could not select ${caseId}. ${diagnostics}`,
        "select-case",
        error,
      );
    }
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
    const previousPatientMessages = await this.readConversationSnapshot("Patient");
    try {
      await selectors.messageInput(this.page).first().fill(message);
      const conversationResponseStatus = this.page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return response.request().method() === "POST" && url.pathname === "/api/conversation";
        },
      ).then((response) => response.status()).catch(() => null);
      const sentAt = Date.now();
      await selectors.sendButton(this.page).first().click();
      return {
        previousPatientMessageCount: previousPatientMessages.count,
        previousLastPatientMessageText: previousPatientMessages.lastText,
        sentAt,
        conversationResponseStatus,
      };
    } catch (error) {
      throw this.interactionError("Could not send the student message. Verify encounter input and send selectors.", "send-message", error);
    }
  }

  public async waitForNextPatientResponse(
    previousPatientMessageCount: number,
    previousLastPatientMessageText: string | null,
    sentAt: number,
    timeoutMs: number,
    conversationResponseStatus: Promise<number | null>,
  ): Promise<PatientInteractionResult> {
    let latestSnapshot = await this.readConversationSnapshot("Patient");
    try {
      await expect.poll(async () => {
        latestSnapshot = await this.readConversationSnapshot("Patient");
        const countIncreased = latestSnapshot.count > previousPatientMessageCount;
        const lastTextChanged = Boolean(
          latestSnapshot.lastText && latestSnapshot.lastText !== previousLastPatientMessageText,
        );
        return countIncreased || lastTextChanged;
      }, {
        message: "Waiting for a new role-scoped Patient message group",
        timeout: timeoutMs,
        intervals: [100, 250, 500],
      }).toBe(true);

      // A stable value across consecutive polls is used as a generic streaming
      // completion signal until OdontIQ exposes an explicit response-complete marker.
      let previousText = latestSnapshot.lastText ?? "";
      let stablePolls = 0;
      await expect.poll(async () => {
        latestSnapshot = await this.readConversationSnapshot("Patient");
        const currentText = latestSnapshot.lastText ?? "";
        stablePolls = currentText.length > 0 && currentText === previousText ? stablePolls + 1 : 0;
        previousText = currentText;
        return stablePolls;
      }, { timeout: timeoutMs, intervals: [250, 500, 750] }).toBeGreaterThanOrEqual(2);

      return {
        response: previousText,
        elapsedResponseTimeMs: Date.now() - sentAt,
        httpStatus: await conversationResponseStatus,
        visibleApplicationError: await this.detectVisibleApplicationError(),
      };
    } catch (error) {
      const postSendSnapshot = await this.readConversationSnapshot("Patient");
      const status = await conversationResponseStatus;
      const diagnostics = await this.collectPatientResponseDiagnostics(
        previousPatientMessageCount,
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

  public async completeEncounter(): Promise<never> {
    throw new OdontiqBrowserInteractionError(
      "Encounter completion is intentionally not implemented in the Phase T foundation.",
      "complete-encounter",
    );
  }

  private interactionError(message: string, operation: string, cause: unknown): OdontiqBrowserInteractionError {
    return new OdontiqBrowserInteractionError(`${message} Current URL: ${this.page.url()}`, operation, { cause });
  }

  private async collectCaseSelectionDiagnostics(caseId: string): Promise<string> {
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

    const cards = selectors.caseCard(this.page, caseId);
    const candidateCount = await cards.count().catch(() => 0);
    const candidateText = candidateCount > 0
      ? (await cards.first().innerText().catch(() => "[unreadable]")).trim().slice(0, 1_000)
      : "[none]";
    const actions = candidateCount > 0 ? selectors.caseAction(cards.first(), caseId) : null;
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
      `Candidate ${selectors.casePatientName(caseId)} cards: ${candidateCount}.`,
      `Candidate card text: ${candidateText}.`,
      `Scoped action count: ${actionCount}; visible: ${actionVisible}; enabled: ${actionEnabled}.`,
      `Screenshot: ${screenshotPath}.`,
      "Trace: artifacts/traces/browser-case01-happy-path-Case-1-happy-path-browser-journey-authenticated-chromium/trace.zip.",
    ].join(" ");
  }

  private async readConversationSnapshot(role: ConversationRole): Promise<ConversationSnapshot> {
    const groups = selectors.conversationMessageGroups(this.page, role);
    const messages: string[] = [];
    const groupCount = await groups.count();
    for (let index = 0; index < groupCount; index += 1) {
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
    for (let index = 0; index < labelCount; index += 1) {
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
