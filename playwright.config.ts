import { defineConfig, devices } from "@playwright/test";
import { clerkAuthStatePath } from "./src/config/authState.js";
import { environment } from "./src/config/environment.js";

export default defineConfig({
  testDir: "./tests",

  timeout: 90_000,

  expect: {
    timeout: 10_000,
  },

  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "artifacts/reports/playwright",
        open: "never",
      },
    ],
  ],

  use: {
    baseURL: environment.baseUrl,

    trace: "retain-on-failure",

    screenshot: "only-on-failure",

    video: "retain-on-failure",

    actionTimeout: environment.timeouts.defaultMs,

    navigationTimeout: environment.timeouts.defaultMs,
  },

  outputDir: "artifacts/traces",

  projects: [
    {
      name: "unit",
      testMatch: /unit[\\/].*\.spec\.ts/,
    },
    {
      name: "global setup",
      testMatch: /auth[\\/]global\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "smoke chromium",
      testMatch: /browser[\\/]application-load\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "authenticated chromium",
      testMatch: /browser[\\/](?:case0[12]-happy-path|case01-completion-report|behavioral-regression|phase-t-release)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: clerkAuthStatePath,
      },
      dependencies: ["global setup"],
    },
  ],
});
