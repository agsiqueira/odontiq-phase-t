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

# Case 2 journey only
npm run test:case02

# Case 1 and Case 2 regression suite
npm run test:cases

# Eight serial virtual-patient behavioral scenarios (four conversation styles per case)
npm run test:behavioral

# Complete Case 1 and validate the generated Faculty Rubric Report
npm run test:case01-report

# Conversation journeys plus completion/report regression
npm run test:regression

# Final release journeys: onboarding, targeted disclosure, Case 2 image, and Cases 1-5 smoke
npm run test:release

# Incremental message-baseline unit tests
npm run test:unit

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

Run authenticated browser suites serially when they share one Clerk account. The release onboarding check needs at least one case without an active server-side encounter; if every case is already active, it is reported as skipped instead of deleting test-user history.

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

1. Define a typed `TestScenario` under `src/scenarios/` with stable scenario and step IDs, `caseId`, `patientName`, and `encounterPath`.
2. Use natural student messages and semantic expectations: required/prohibited phrases, a response-time maximum, and optional patient-role evaluation. Avoid exact patient wording.
3. Create a small Playwright spec that passes the scenario to `BrowserJourneyRunner` and attaches its JSON report.
4. Verify any new UI element in codegen and add its selector only to `src/config/selectors.ts`.
5. Run `npm run typecheck` and the scenario test.

Deterministic patient-role patterns are intentionally narrow heuristics. They can flag known instructor-like phrases, but they do not establish full clinical or role correctness.

## Supported case journeys

- Case 1: Amara Johnson at `/encounter/case-01`
- Case 2: Marcus Lee at `/encounter/case-02`

Release smoke coverage also opens Cases 3-5 through the same browser client. `npm run test:release` additionally checks the NPO response boundary, Case 3 gum-palpation recognition, Case 3 progressive disclosure, and the Case 2 examination image and zoom presentation.

Both journeys use the same `BrowserJourneyRunner`, browser client, scoped case-card behavior, transcript detection, deterministic evaluator, reporting, and authenticated Playwright project. Scenario files supply patient identity, encounter path, messages, and tolerant expectations; no case-specific runner is created.

## Encounter completion and Faculty Rubric Report

`npm run test:case01-report` opens Case 1 through its scoped patient card, records whether the UI started, resumed, or restarted the attempt, conducts a seven-step clinically appropriate consultation, and clicks the real `Finish Consultation` control exactly once. Phase T then monitors the encounter completion and evaluation responses and allows up to 90 seconds for LLM-backed report generation.

The confirmed workflow navigates from `/encounter/case-01` to `/mentor/case-01?attemptId=...`, waits for mentor generation to finish, follows the real `View Report` link, and expects `/reports/case-01?attemptId=...`. Query strings are removed from stored report URLs. A collapsed Encounter Transcript is expanded using its accessible control and `aria-expanded` state.

The structured JSON result records the attempt state, conversation-step count, completion label and HTTP status, sanitized evaluation URL/status, report-generation duration, report route, visible section presence, optional numeric score/range, Strengths, Areas for Improvement, and Student/Patient transcript counts. Required sections are the Faculty Rubric Report heading, Case 1 identity, meaningful Strengths and Areas for Improvement, and an Encounter Transcript containing both roles. Exact evaluator prose and a particular score are not required.

Completion artifacts use the same locations as other journeys: JSON under `artifacts/reports/runs/` and Playwright screenshots, videos, and traces under `artifacts/traces/`. If report generation is interrupted or the report API is unavailable, the test records the first real blocker and fails without retrying submission or fabricating report content.

## Repeated runs and accumulated transcripts

Conversation scenarios use an incremental Patient-message baseline. Before each Student message, Phase T records only the current Patient-group count, the latest Patient text, and a stable last-container identity when available. Polling then inspects at most the newest three candidate containers and accepts a response only when its count, identity, or final text is demonstrably newer than that step's baseline. Historical transcript text is not copied into ordinary journey reports.

Full transcript extraction is reserved for a ready Faculty Rubric Report. It runs once, reads the report's scoped transcript list, and maps OdontIQ's visible `Provider` role back to the Phase T `Student` role. Diagnostic transcript snapshots are capped at 20 messages.

Scenario attempt policies are `resume`, `prefer-new`, `require-new`, and `reuse-completed-report`. Happy paths default to `prefer-new`; completion/report uses `require-new`. Phase T uses only actions that OdontIQ actually exposes: Start and Restart produce a new attempt, while Resume is used safely when no new-attempt action is available. The chosen state is recorded as started, resumed, restarted, or completed-report-reused.

Timeouts are stage-specific: encounter navigation is 15 seconds, conversation HTTP and new Patient response are 30 seconds, DOM stabilization is 5 seconds, report generation is 90 seconds, and standard visible-element rendering remains bounded by the Playwright configuration. JSON reports include authentication, case selection, encounter navigation, each conversation step, completion submission, report generation, and report extraction timings plus the first failing stage.

Repeated-run checks:

```powershell
npm run test:case01 -- --headed --workers=1 --repeat-each=3 --trace=retain-on-failure
npm run test:case02 -- --headed --workers=1 --repeat-each=3 --trace=retain-on-failure
npm run test:cases -- --headed --workers=1 --repeat-each=2 --trace=retain-on-failure
```

## Virtual-patient behavioral regression

`npm run test:behavioral` runs standard clinical, short/direct, compound/imperfect, and treatment/closing conversations for every currently supported case. The authenticated project remains serial because all journeys share one Clerk account and server-side attempt history.

Every newly correlated Patient turn is checked independently for strong provider-role language, serialized JSON or markup, prompt/tool metadata, placeholders, code fences, malformed Unicode, repeated sentence blocks, excessive punctuation, truncation, excessive length, immediate verbatim repetition, configured topic relevance, and conservative contradictions of stable case facts. Hard defects fail the journey; less certain mechanical-quality signals are warnings and remain visible in the JSON report.

Case contracts contain only facts confirmed through black-box behavior. No progressive-disclosure rule is enforced unless a reliable reveal boundary is configured; unsupported assumptions are deliberately omitted. A first-response fact-volume check is a warning rather than a failure.

An optional independent semantic evaluator can be enabled with `PHASE_T_SEMANTIC_EVALUATOR_URL` and, if needed, `PHASE_T_SEMANTIC_EVALUATOR_KEY`. It receives only the case identifier, permitted evaluation facts, the latest three run-local turns, the current Student message, and its correlated Patient response. It must return strict JSON scores for `patientRoleFidelity`, `questionRelevance`, `caseConsistency`, `naturalPatientDialogue`, `artifactFree`, `disclosureCompliance`, and `clinicalSafety`. Semantic evaluation is disabled when no URL is configured and never receives Clerk state, credentials, cookies, or unrelated accumulated transcripts.
