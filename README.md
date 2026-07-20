# OdontIQ Phase T

Phase T is an independent, browser-driven synthetic testing project for OdontIQ. It behaves like an external student: it opens the deployed application, authenticates through the real Clerk UI, selects a case, conducts a short patient interview, evaluates deterministic signals, and writes a structured JSON result.

This repository must remain independent from the OdontIQ application. It must not import OdontIQ source code or Prisma models, access the OdontIQ database, add test-only application behavior, or bypass authentication. That boundary keeps the journey representative of a real external user and prevents tests from depending on private implementation details.

## Install

```powershell
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env` and set:

- `ODONTIQ_BASE_URL`: OdontIQ origin, such as `http://localhost:3000`.
- `CLERK_PUBLISHABLE_KEY`: publishable key for the Clerk development instance used by local OdontIQ.
- `CLERK_SECRET_KEY`: secret key for that same Clerk development instance.
- `PHASE_T_TEST_EMAIL`: email for an existing dedicated test user in that instance.
- `PHASE_T_TEST_PASSWORD`: retained only for explicit UI-authentication fallback testing.
- `PHASE_T_ENVIRONMENT`: short report label such as `local`, `staging`, or `production-test`.
- The timeout variables are optional and have defaults in `.env.example`.

Never commit `.env`, Clerk keys, testing tokens, or Playwright storage state. The dedicated test user must already exist; Phase T does not create or delete it in this iteration.

## Clerk authenticated state

Fresh Playwright contexts caused Clerk Client Trust to request an emailed new-device verification code on every password login. Phase T therefore uses Clerk's official `@clerk/testing` Playwright integration instead of retrieving email codes or weakening authentication.

The `global setup` Playwright project:

1. Calls `clerkSetup()` to obtain a short-lived Clerk Testing Token.
2. Loads an unprotected OdontIQ page so Clerk initializes.
3. Uses `clerk.signIn({ emailAddress })`, which creates the test-user session server-side.
4. verifies that `/cases` remains accessible without a login or Client Trust redirect.
5. Saves the authenticated browser state to `playwright/.clerk/user.json`.

The `authenticated chromium` project depends on that setup project and loads the saved state before Case 1 begins. Case 1 does not retry UI password entry if the configured state is invalid. The existing UI flow remains available only to callers that explicitly allow the fallback.

Both Clerk keys must belong to the same development instance configured in local OdontIQ. The test user identified by `PHASE_T_TEST_EMAIL` must also exist in that instance.

## Run

```powershell
# Application-load smoke test only
npx playwright test tests/browser/application-load.spec.ts

# Generate or refresh Clerk authenticated state only
npm run test:auth-setup

# Case 1 journey only
npm run test:case01

# All browser tests
npm run test:browser

# All tests in a visible browser
npm run test:browser:headed

# Interactive Playwright UI
npm run test:browser:ui

# Open the most recent Playwright HTML report
npm run report
```

Run `npm run typecheck` separately for strict TypeScript validation.

To invalidate the saved session, delete `playwright/.clerk/user.json` and rerun `npm run test:auth-setup`. The entire `playwright/.clerk/` directory is ignored by Git and must never be committed. Running Case 1 also runs its setup dependency and regenerates the state.

## Artifacts

- Phase T JSON run reports: `artifacts/reports/runs/`
- Playwright HTML report: `artifacts/reports/playwright/`
- Playwright traces, failure screenshots, and retained failure videos: `artifacts/traces/`

JSON filenames include the environment, case, scenario, timestamp, and unique run ID. Reports are created with non-overwrite semantics. URLs are stripped of query strings and credentials, bearer values are redacted, and credential/session-like keys are not serialized.

Clerk publishable/secret keys, testing tokens, session identifiers, cookies, authorization values, JWTs, and configured credentials are redacted from Phase T diagnostics. Playwright storage state is sensitive because it contains an authenticated session; handle it like a credential.

## Selector verification

All UI knowledge lives in `src/config/selectors.ts`. Optional `data-testid` selectors are paired with accessible-role fallbacks where possible. The fallbacks are assumptions until checked against the current OdontIQ and Clerk UI.

Use Playwright codegen while OdontIQ is running:

```powershell
npx playwright codegen http://localhost:3000
```

Verify these assumptions in particular:

- An authenticated page exposes a Cases link or an accessible user/account/profile button.
- The case list is reachable through a Cases link or button.
- Case 1 is selectable by `data-testid="case-card-case-01"` or an accessible Case 1 link.
- The consultation action has an accessible start/restart/begin/resume label.
- The message input and send button have accessible message/send names.
- Each complete patient message exposes `data-testid="patient-message"`.
- Visible application errors use an alert role or standard error wording.

The current generic response-completion heuristic waits for a new non-empty patient-message element whose text remains stable across consecutive polls. An explicit OdontIQ response-complete state would be more reliable for streamed messages, but Phase T must not modify or assume it without inspection.

Recommended stable OdontIQ test IDs are:

- `case-card-case-01`
- `start-consultation-button`
- `encounter-message-input`
- `encounter-send-button`
- `patient-message`
- `finish-consultation-button`

## Add a scenario

1. Define a typed `TestScenario` under `src/scenarios/` with stable scenario and step IDs.
2. Use natural student messages and semantic expectations: required/prohibited phrases, a response-time maximum, and optional patient-role evaluation. Avoid exact patient wording.
3. Create a small Playwright spec that passes the scenario to `BrowserJourneyRunner` and attaches its JSON report.
4. Verify any new UI element in codegen and add its selector only to `src/config/selectors.ts`.
5. Run `npm run typecheck` and the scenario test.

Deterministic patient-role patterns are intentionally narrow heuristics. They can flag known instructor-like phrases, but they do not establish full clinical or role correctness.
