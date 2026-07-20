import type { Locator, Page } from "@playwright/test";

export type ConversationRole = "Student" | "Patient";

/**
 * All UI knowledge is centralized here. data-testid locators are preferred when
 * OdontIQ exposes them; accessible fallbacks keep Phase T usable in the meantime.
 * Verify every fallback against the current OdontIQ UI with Playwright codegen.
 */
export const selectors = {
  case01PatientName: "Amara Johnson",

  signInButton: (page: Page): Locator =>
    page.getByRole("button", { name: /^sign in$/i })
      .or(page.getByRole("link", { name: /^sign in$/i }))
      .or(page.locator('a[href="/login"], a[href$="/login"]')),

  clerkEmailInput: (page: Page): Locator =>
    page.getByLabel(/^email address$|^email$/i)
      .or(page.getByRole("textbox", { name: /^email address$|^email$/i }))
      .or(page.getByPlaceholder(/enter your email address|email address|email/i))
      .or(page.locator('input[name="identifier"], input[type="email"]')),

  clerkPasswordInput: (page: Page): Locator =>
    page.getByLabel(/^password$/i)
      .or(page.getByPlaceholder(/enter your password|password/i))
      .or(page.locator('input[name="password"], input[type="password"]')),

  clerkContinueButton: (page: Page): Locator =>
    page.getByRole("button", { name: /^continue$|^sign in$/i }),

  clerkVerificationMarker: (page: Page): Locator =>
    page.getByText(/verification code|verify your email|check your email/i),

  clerkMfaMarker: (page: Page): Locator =>
    page.getByText(/two-factor|multi-factor|authenticator|security code/i),

  clerkCaptchaMarker: (page: Page): Locator =>
    page.locator('iframe[title*="captcha" i], iframe[src*="captcha" i], [data-clerk-captcha]'),

  clerkLoadedMarker: (page: Page): Locator =>
    page.getByText(/secured by|development mode/i),

  // Verify against the current OdontIQ UI.
  authenticatedMarker: (page: Page): Locator =>
    page.getByRole("link", { name: /cases/i }).or(
      page.getByRole("button", { name: /user|account|profile/i }),
    ),

  // Verify against the current OdontIQ UI.
  caseListLink: (page: Page): Locator =>
    page.getByRole("link", { name: /cases/i }).or(
      page.getByRole("button", { name: /cases/i }),
    ),

  casePatientName: (caseId: string): string => {
    if (caseId === "case-01") return "Amara Johnson";
    throw new Error(`No patient identity is configured for ${caseId}.`);
  },

  caseCardContainers: (page: Page): Locator => page.getByRole("article"),

  casePatientHeadings: (page: Page): Locator =>
    page.getByRole("article").getByRole("heading", { level: 2 }),

  caseCard: (page: Page, caseId: string): Locator => {
    const patientName = selectors.casePatientName(caseId);
    return page.getByTestId(`case-card-${caseId}`).or(
      page.getByRole("article").filter({
        has: page.getByRole("heading", { name: patientName, exact: true }),
      }),
    );
  },

  caseStartAction: (card: Locator, caseId: string): Locator =>
    card.getByRole("button", { name: /^start case$/i }).or(
      card.locator(`a[href="/encounter/${caseId}"]`).filter({ hasText: /start case/i }),
    ),

  caseResumeAction: (card: Locator, caseId: string): Locator =>
    card.getByRole("button", { name: /^resume case$/i }).or(
      card.locator(`a[href="/encounter/${caseId}"]`).filter({ hasText: /resume case/i }),
    ),

  caseRestartAction: (card: Locator, caseId: string): Locator =>
    card.getByRole("button", { name: /^restart case$/i }).or(
      card.locator(`a[href="/encounter/${caseId}"]`).filter({ hasText: /restart case/i }),
    ),

  caseAction: (card: Locator, caseId: string): Locator =>
    selectors.caseStartAction(card, caseId)
      .or(selectors.caseResumeAction(card, caseId))
      .or(selectors.caseRestartAction(card, caseId)),

  visibleCaseActionLabels: (page: Page): Locator =>
    page.getByText(/^(?:start|resume|restart) case$/i, { exact: true }),

  caseEncounterUrlPattern: (caseId: string): RegExp =>
    new RegExp(`/encounter/${caseId}(?:[/?#]|$)`, "i"),

  caseEncounterMarker: (page: Page, caseId: string): Locator =>
    page.getByRole("heading", {
      name: selectors.casePatientName(caseId),
      exact: true,
    })
      .or(page.getByText(selectors.casePatientName(caseId), { exact: true }))
      .or(page.getByText(new RegExp(`^case\\s*0?${caseId.replace(/\D/g, "")}$`, "i"))),

  startConsultationButton: (page: Page): Locator =>
    page.getByTestId("start-consultation-button").or(
      // Verify against the current OdontIQ UI, including restart wording.
      page.getByRole("button", { name: /start|restart|begin|resume.*consultation/i }),
    ),

  messageInput: (page: Page): Locator =>
    page.getByTestId("encounter-message-input").or(
      // Verify the accessible name against the current OdontIQ UI.
      page.getByRole("textbox", { name: /message|ask|question/i }),
    ),

  sendButton: (page: Page): Locator =>
    page.getByTestId("encounter-send-button").or(
      page.getByRole("button", { name: /send/i }),
    ),

  conversationRoleLabels: (page: Page, role: ConversationRole): Locator =>
    page.getByText(role, { exact: true }),

  conversationMessageGroups: (page: Page, role: ConversationRole): Locator =>
    page.getByTestId(`${role.toLocaleLowerCase()}-message`).or(
      // Confirmed DOM fallback: the exact role <p> and message-body <p> share one direct parent <div>.
      selectors.conversationRoleLabels(page, role).locator(".."),
    ),

  conversationGroupRoleLabel: (group: Locator, role: ConversationRole): Locator =>
    group.locator(":scope > p").filter({ hasText: new RegExp(`^${role}$`, "i") }),

  conversationGroupBodyCandidates: (group: Locator): Locator =>
    group.locator(":scope > p").filter({ hasNotText: /^(?:student|patient)$/i }),

  finishConsultationButton: (page: Page): Locator =>
    page.getByTestId("finish-consultation-button").or(
      page.getByRole("button", { name: /finish|complete.*consultation/i }),
    ),

  // Verify visible alert conventions against the current OdontIQ UI.
  visibleApplicationErrors: (page: Page): Locator =>
    page.getByRole("alert").or(page.getByText(/something went wrong|unexpected error|try again/i)),
} as const;
