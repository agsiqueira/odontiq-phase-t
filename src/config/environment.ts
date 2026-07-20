import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function numberFromEnvironment(
  name: string,
  fallback: number,
): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${name} must be a positive number.`,
    );
  }

  return parsed;
}

export const environment = {
  baseUrl: required("ODONTIQ_BASE_URL"),
  testEmail: process.env.PHASE_T_TEST_EMAIL ?? "",
  testPassword: process.env.PHASE_T_TEST_PASSWORD ?? "",
  name: process.env.PHASE_T_ENVIRONMENT ?? "local",

  timeouts: {
    defaultMs: numberFromEnvironment(
      "PHASE_T_DEFAULT_TIMEOUT_MS",
      30_000,
    ),
    responseWarningMs: numberFromEnvironment(
      "PHASE_T_RESPONSE_WARNING_MS",
      8_000,
    ),
    completionWarningMs: numberFromEnvironment(
      "PHASE_T_COMPLETION_WARNING_MS",
      10_000,
    ),
  },
} as const;