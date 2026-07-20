import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test as setup } from "@playwright/test";
import { clerkAuthStatePath } from "../../src/config/authState.js";

setup.describe.configure({ mode: "serial" });

const keyStatus = {
  publishableKeyDetected: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
  secretKeyDetected: Boolean(process.env.CLERK_SECRET_KEY),
  testEmailDetected: Boolean(process.env.PHASE_T_TEST_EMAIL),
};

const stageTimeoutMs = 30_000;

interface ClerkReadinessDiagnostics {
  currentUrl: string;
  windowClerkExists: boolean;
  clerkReportsLoaded: boolean;
  signInRootAttached: boolean;
  rootBoxAttached: boolean;
  emailInputAttached: boolean;
  passwordInputAttached: boolean;
  iframeCount: number;
  loadedFrontendMatchesConfiguredKey: boolean;
  clerkEnvironmentStatus: number | null;
}

setup("configure Clerk testing", async () => {
  const missing = [
    !keyStatus.publishableKeyDetected ? "CLERK_PUBLISHABLE_KEY" : null,
    !keyStatus.secretKeyDetected ? "CLERK_SECRET_KEY" : null,
    !keyStatus.testEmailDetected ? "PHASE_T_TEST_EMAIL" : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new Error(
      `Clerk setup keys are incomplete. Missing: ${missing.join(", ")}. ` +
      `Detected publishable key: ${keyStatus.publishableKeyDetected}; ` +
      `detected secret key: ${keyStatus.secretKeyDetected}; ` +
      `detected test email: ${keyStatus.testEmailDetected}.`,
    );
  }

  validateDevelopmentKeyPrefixes();

  try {
    await clerkSetup();
  } catch (error) {
    throw new Error(
      `clerkSetup() failed. Key detection: ${JSON.stringify(keyStatus)}. ` +
      `Sanitized Clerk error: ${sanitizeClerkError(error)}`,
      { cause: error },
    );
  }
});

setup("authenticate test user and save Clerk state", async ({ page }, testInfo) => {
  let activeStage = "initialization";
  let loginNavigationCompleted = false;
  let clerkLoadedCompleted = false;
  let clerkRootAttached = false;
  let clerkSignInCompleted = false;
  let protectedCasesAccessible = false;
  let storageStateCreated = false;
  let readiness: ClerkReadinessDiagnostics | null = null;
  let clerkEnvironmentStatus: number | null = null;
  const expectedFrontendApi = decodePublishableFrontendApi(process.env.CLERK_PUBLISHABLE_KEY!);

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname === expectedFrontendApi && url.pathname === "/v1/environment") {
      clerkEnvironmentStatus = response.status();
    }
  });

  try {
    activeStage = "Clerk Testing Token browser route setup";
    await setupClerkTestingToken({ page });

    activeStage = "/login navigation";
    try {
      const response = await page.goto("/login", {
        waitUntil: "domcontentloaded",
        timeout: stageTimeoutMs,
      });
      if (response && response.status() >= 400) {
        throw new Error(`/login returned HTTP ${response.status()}.`);
      }
      loginNavigationCompleted = true;
    } catch (error) {
      throw new Error(`/login navigation failed: ${sanitizeClerkError(error)}`, { cause: error });
    }

    activeStage = "clerk.loaded()";
    try {
      await withTimeout(
        clerk.loaded({ page }),
        stageTimeoutMs,
        "clerk.loaded() timed out before the Clerk JavaScript SDK reported ready",
      );
      await page.waitForFunction(
        () => (window as typeof window & { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
        undefined,
        { timeout: stageTimeoutMs },
      );
      clerkLoadedCompleted = true;
    } catch (error) {
      throw new Error(`clerk.loaded() failed: ${sanitizeClerkError(error)}`, { cause: error });
    }

    activeStage = "Clerk root attachment";
    try {
      await page
        .locator(".cl-signIn-root, .cl-rootBox")
        .first()
        .waitFor({ state: "attached", timeout: stageTimeoutMs });
      clerkRootAttached = true;
    } catch (error) {
      throw new Error(`Clerk form never attached: ${sanitizeClerkError(error)}`, { cause: error });
    }

    activeStage = "Clerk readiness and instance alignment";
    readiness = await collectReadiness(page, expectedFrontendApi, clerkEnvironmentStatus);
    await testInfo.attach("clerk-readiness.json", {
      body: Buffer.from(`${JSON.stringify(readiness, null, 2)}\n`, "utf8"),
      contentType: "application/json",
    });
    if (!readiness.loadedFrontendMatchesConfiguredKey) {
      throw new Error(
        "Clerk instance mismatch: the Clerk frontend loaded by local OdontIQ does not match the configured development publishable key.",
      );
    }
    if (readiness.clerkEnvironmentStatus !== null && readiness.clerkEnvironmentStatus >= 400) {
      throw new Error(
        `Clerk instance mismatch or Testing Token rejection: the configured Clerk frontend returned HTTP ${readiness.clerkEnvironmentStatus}.`,
      );
    }

    activeStage = "clerk.signIn()";
    try {
      await withTimeout(
        clerk.signIn({
          page,
          emailAddress: process.env.PHASE_T_TEST_EMAIL!,
        }),
        stageTimeoutMs,
        "clerk.signIn() timed out after 30000 ms",
        async () => page.close().catch(() => undefined),
      );
    } catch (error) {
      throw new Error(`clerk.signIn() failed: ${sanitizeClerkError(error)}`, { cause: error });
    }
    clerkSignInCompleted = true;

    activeStage = "protected /cases validation";
    try {
      const response = await page.goto("/cases", {
        waitUntil: "domcontentloaded",
        timeout: stageTimeoutMs,
      });
      const currentUrl = page.url();
      const authenticationRedirect = /\/(?:login|sign-in|client-trust)(?:\/|$)/i.test(
        new URL(currentUrl).pathname,
      );
      protectedCasesAccessible = !authenticationRedirect && response !== null && response.status() < 400;

      expect(
        protectedCasesAccessible,
        `Expected /cases to remain accessible after Clerk sign-in, but reached ${sanitizeUrl(currentUrl)} ` +
        `with HTTP ${response?.status() ?? "unobservable"}.`,
      ).toBe(true);
      await expect(page.locator("body")).toBeVisible();
    } catch (error) {
      throw new Error(`Protected-route validation failed: ${sanitizeClerkError(error)}`, { cause: error });
    }

    await mkdir(path.dirname(clerkAuthStatePath), { recursive: true });
    await page.context().storageState({ path: clerkAuthStatePath });
    await access(clerkAuthStatePath);
    storageStateCreated = true;
  } catch (error) {
    throw new Error(
      [
        "Clerk authenticated-state setup failed.",
        "clerkSetup() succeeded: true.",
        `Required keys detected: ${JSON.stringify(keyStatus)}.`,
        `Active stage: ${activeStage}.`,
        `/login navigation completed: ${loginNavigationCompleted}.`,
        `clerk.loaded() completed: ${clerkLoadedCompleted}.`,
        `Clerk root attached: ${clerkRootAttached}.`,
        `clerk.signIn() completed: ${clerkSignInCompleted}.`,
        `/cases remained protected and accessible: ${protectedCasesAccessible}.`,
        `Storage state file created: ${storageStateCreated}.`,
        `Current URL: ${sanitizeUrl(page.url())}.`,
        `Readiness: ${JSON.stringify(readiness)}.`,
        `Sanitized Clerk error: ${sanitizeClerkError(error)}.`,
      ].join(" "),
      { cause: error },
    );
  }
});

function validateDevelopmentKeyPrefixes(): void {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY!;
  const secretKey = process.env.CLERK_SECRET_KEY!;
  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error("CLERK_PUBLISHABLE_KEY must be a Clerk development key with the pk_test_ prefix.");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a Clerk development key with the sk_test_ prefix.");
  }
  decodePublishableFrontendApi(publishableKey);
}

function decodePublishableFrontendApi(publishableKey: string): string {
  try {
    const encoded = publishableKey.slice("pk_test_".length);
    const decoded = Buffer.from(encoded, "base64url").toString("utf8").replace(/\$$/, "");
    const hostname = new URL(`https://${decoded}`).hostname;
    if (!hostname.endsWith(".clerk.accounts.dev")) throw new Error("Unexpected hostname.");
    return hostname;
  } catch (error) {
    throw new Error("CLERK_PUBLISHABLE_KEY is not a valid Clerk development publishable key.", { cause: error });
  }
}

async function collectReadiness(
  page: Page,
  expectedFrontendApi: string,
  clerkEnvironmentStatus: number | null,
): Promise<ClerkReadinessDiagnostics> {
  const browserReadiness = await page.evaluate((expectedHost) => {
    const clerk = (window as typeof window & {
      Clerk?: { frontendApi?: string; loaded?: boolean };
    }).Clerk;
    const scriptHosts = Array.from(document.scripts)
      .map((script) => {
        try {
          return script.src ? new URL(script.src).hostname : "";
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const loadedFrontendApi = clerk?.frontendApi?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "";
    return {
      windowClerkExists: Boolean(clerk),
      clerkReportsLoaded: clerk?.loaded === true,
      signInRootAttached: document.querySelector(".cl-signIn-root") !== null,
      rootBoxAttached: document.querySelector(".cl-rootBox") !== null,
      emailInputAttached: document.querySelector('input[name="identifier"], input[name="emailAddress"], input[type="email"]') !== null,
      passwordInputAttached: document.querySelector('input[name="password"], input[type="password"]') !== null,
      iframeCount: document.querySelectorAll("iframe").length,
      loadedFrontendMatchesConfiguredKey:
        loadedFrontendApi === expectedHost || scriptHosts.includes(expectedHost),
    };
  }, expectedFrontendApi);

  return {
    currentUrl: sanitizeUrl(page.url()),
    ...browserReadiness,
    clerkEnvironmentStatus,
  };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  onTimeout?: () => Promise<unknown>,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      void onTimeout?.().finally(() => reject(new Error(timeoutMessage)));
      if (!onTimeout) reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function sanitizeClerkError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of [
    process.env.CLERK_PUBLISHABLE_KEY,
    process.env.CLERK_SECRET_KEY,
    process.env.CLERK_TESTING_TOKEN,
    process.env.PHASE_T_TEST_EMAIL,
    process.env.PHASE_T_TEST_PASSWORD,
  ]) {
    if (value) message = message.split(value).join("[REDACTED]");
  }
  return message
    .replace(/\b(?:pk|sk)_(?:test|live)_[a-zA-Z0-9_-]+\b/g, "[REDACTED]")
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[REDACTED]");
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
