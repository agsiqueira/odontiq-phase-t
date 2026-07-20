import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { selectors } from "../config/selectors.js";

export class ClerkAuthenticationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClerkAuthenticationError";
  }
}

export interface ClerkCredentials {
  email: string;
  password: string;
}

function validateCredentials(credentials: ClerkCredentials): void {
  const missing = [
    !credentials.email ? "PHASE_T_TEST_EMAIL" : null,
    !credentials.password ? "PHASE_T_TEST_PASSWORD" : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new ClerkAuthenticationError(
      `Missing required test credential environment variable(s): ${missing.join(", ")}.`,
    );
  }
}

export async function authenticateClerkTestSession(
  page: Page,
  credentials: ClerkCredentials,
  isAuthenticated: () => Promise<boolean>,
): Promise<void> {
  if (await isAuthenticated()) {
    return;
  }

  validateCredentials(credentials);

  try {
    await waitForAuthenticationEntryState(page);
  } catch {
    if (await isAuthenticated()) {
      return;
    }
    await page.goto(new URL("/login", page.url()).toString());
    try {
      await waitForVisible(selectors.clerkEmailInput(page), 15_000);
    } catch (error) {
      throw await authenticationFailure(page, "clerkEmailInput at /login", error);
    }
  }

  if (await isAuthenticated()) {
    return;
  }

  if (await isAnyVisible(selectors.signInButton(page))) {
    await (await firstVisible(selectors.signInButton(page))).click();
    try {
      await waitForVisible(selectors.clerkEmailInput(page), 15_000);
    } catch (error) {
      throw await authenticationFailure(page, "clerkEmailInput after signInButton", error);
    }
  }

  let emailInput: Locator;
  try {
    emailInput = await firstVisible(selectors.clerkEmailInput(page));
  } catch (error) {
    throw await authenticationFailure(page, "clerkEmailInput", error);
  }

  await emailInput.fill(credentials.email);

  // OdontIQ currently renders email and password together. Clerk can also use
  // a sequential identifier-first flow, so support both without fixed sleeps.
  if (await isAnyVisible(selectors.clerkPasswordInput(page))) {
    await (await firstVisible(selectors.clerkPasswordInput(page))).fill(credentials.password);
    await (await firstVisible(selectors.clerkContinueButton(page))).click();
  } else {
    await (await firstVisible(selectors.clerkContinueButton(page))).click();
    try {
      await waitForVisible(selectors.clerkPasswordInput(page), 15_000);
    } catch (error) {
      throw await authenticationFailure(page, "clerkPasswordInput", error);
    }

    // Never log, attach, or otherwise expose this value.
    await (await firstVisible(selectors.clerkPasswordInput(page))).fill(credentials.password);
    await (await firstVisible(selectors.clerkContinueButton(page))).click();
  }

  try {
    await expect.poll(async () => {
      const blockingScreen = await detectBlockingAuthenticationScreen(page);
      if (blockingScreen) {
        throw new Error(`Clerk requires ${blockingScreen}.`);
      }
      return isAuthenticated();
    }, {
      message: "Waiting for a protected OdontIQ route or authenticated UI marker",
      timeout: 30_000,
      intervals: [100, 250, 500, 1_000],
    }).toBe(true);
  } catch (error) {
    throw await authenticationFailure(page, "authenticatedMarker or protected route", error);
  }
}

async function waitForAuthenticationEntryState(page: Page): Promise<void> {
  await selectors.authenticatedMarker(page)
    .or(selectors.signInButton(page))
    .or(selectors.clerkEmailInput(page))
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForVisible(locator: Locator, timeout: number): Promise<void> {
  await locator.first().waitFor({ state: "visible", timeout });
}

async function isAnyVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function firstVisible(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  throw new Error("No visible element matched the selector.");
}

async function authenticationFailure(
  page: Page,
  activeSelector: string,
  cause: unknown,
): Promise<ClerkAuthenticationError> {
  const screenshotPath = path.resolve(
    "artifacts",
    "screenshots",
    `authentication-failure-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  const diagnostics = await collectAuthenticationDiagnostics(page);
  return new ClerkAuthenticationError(
    [
      `Clerk authentication failed at ${page.url()}.`,
      `Active selector attempted: ${activeSelector}.`,
      `Detected screen: ${diagnostics.screen}.`,
      `Visible buttons: ${formatList(diagnostics.buttons)}.`,
      `Visible links: ${formatList(diagnostics.links)}.`,
      `Visible input labels/placeholders: ${formatList(diagnostics.inputs)}.`,
      `Iframes: ${diagnostics.iframeCount} (${formatList(diagnostics.iframes)}).`,
      `Diagnostic screenshot: ${screenshotPath}.`,
    ].join(" "),
    { cause },
  );
}

async function collectAuthenticationDiagnostics(page: Page): Promise<{
  buttons: string[];
  links: string[];
  inputs: string[];
  iframeCount: number;
  iframes: string[];
  screen: string;
}> {
  const visibleTexts = async (locator: Locator): Promise<string[]> => {
    const values: string[] = [];
    const count = Math.min(await locator.count(), 20);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        const text = (await candidate.getAttribute("aria-label")) ?? (await candidate.innerText().catch(() => ""));
        values.push(text.trim() || "[unnamed]");
      }
    }
    return values;
  };

  const inputValues: string[] = [];
  const inputs = page.locator("input");
  const inputCount = Math.min(await inputs.count(), 20);
  for (let index = 0; index < inputCount; index += 1) {
    const input = inputs.nth(index);
    if (await input.isVisible().catch(() => false)) {
      inputValues.push(
        (await input.getAttribute("aria-label")) ??
        (await input.getAttribute("placeholder")) ??
        (await input.getAttribute("name")) ??
        "[unnamed]",
      );
    }
  }

  const frames = page.locator("iframe");
  const iframeCount = await frames.count();
  const frameValues: string[] = [];
  for (let index = 0; index < Math.min(iframeCount, 10); index += 1) {
    const frame = frames.nth(index);
    frameValues.push(
      (await frame.getAttribute("title")) ??
      (await frame.getAttribute("name")) ??
      (await frame.getAttribute("src")) ??
      "[unnamed iframe]",
    );
  }

  const screen = await detectAuthenticationScreen(page);
  return {
    buttons: await visibleTexts(page.getByRole("button")),
    links: await visibleTexts(page.getByRole("link")),
    inputs: inputValues,
    iframeCount,
    iframes: frameValues,
    screen,
  };
}

async function detectAuthenticationScreen(page: Page): Promise<string> {
  if (await isAnyVisible(selectors.clerkCaptchaMarker(page))) return "CAPTCHA";
  if (await isAnyVisible(selectors.clerkMfaMarker(page))) return "MFA";
  if (await isAnyVisible(selectors.clerkVerificationMarker(page))) return "verification";
  if (await isAnyVisible(selectors.clerkPasswordInput(page))) return "password";
  if (await isAnyVisible(selectors.clerkEmailInput(page))) return "email";
  if (await isAnyVisible(selectors.signInButton(page))) return "landing page with Sign in control";
  if (await isAnyVisible(selectors.clerkLoadedMarker(page))) return "other Clerk screen";
  return "unknown";
}

async function detectBlockingAuthenticationScreen(page: Page): Promise<string | null> {
  if (await isAnyVisible(selectors.clerkCaptchaMarker(page))) return "CAPTCHA completion";
  if (await isAnyVisible(selectors.clerkMfaMarker(page))) return "MFA completion";
  if (await isAnyVisible(selectors.clerkVerificationMarker(page))) return "email verification";
  return null;
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(" | ") : "[none]";
}
