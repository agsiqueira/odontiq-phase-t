import type { CaseBehaviorContract, ScenarioExpectation } from "../types/scenario.js";
import type { TestAssertionResult } from "../types/testResult.js";
import { normalizeDurationToDays } from "./durationNormalizer.js";
import { normalizeDentalLocation } from "./anatomicalLocationNormalizer.js";

export interface BehavioralEvaluationInput {
  stepId: string;
  stepIndex: number;
  studentMessage: string;
  response: string | null;
  previousPatientResponse?: string;
  expectation: ScenarioExpectation;
  contract?: CaseBehaviorContract;
}

const providerRolePatterns: readonly RegExp[] = [
  /\byour diagnosis is\b/i,
  /\bi diagnose you\b/i,
  /\bi (?:am|will be|'m) prescribing\b/i,
  /\bi will prescribe\b/i,
  /\bas your (?:dentist|doctor)\b/i,
  /\bmy patient\b/i,
  /\bon examination i found\b/i,
  /\bi recommend that you\s+(?:start|stop|take|undergo|schedule|seek)\b/i,
  /\byou need to (?:start|stop|take)\b.{0,60}\b(?:medication|medicine|antibiotic|treatment|mg)\b/i,
  /(?:^|[.!?]\s*)take\s+\d+(?:\.\d+)?\s*mg\b/i,
];

const hardArtifactPatterns: ReadonlyArray<[string, RegExp]> = [
  ["code fence", /```/],
  ["HTML/XML fragment", /<\/?(?:html|body|div|span|script|system|assistant|tool|function)(?:\s[^>]*)?>/i],
  ["markdown heading", /(?:^|\n)\s{0,3}#{1,6}\s+\S/m],
  ["model metadata", /\b(?:system message|user role|assistant role|turnPolicy\.|providerMessageIntent|latestTopics|asksRestrictedClinicalInterpretation)\b/i],
  ["simulation boundary language", /\b(?:end of simulation|simulation (?:is|was) (?:a )?fictional|legal disclaimer)\b/i],
  ["template placeholder", /\{\{[^}]+\}\}|\$\{[^}]+\}|\[\[(?:[^\]]+)\]\]/],
  ["tool/function syntax", /\b(?:tool_call|function_call|arguments)\s*[:=]\s*[\[{]/i],
  ["malformed Unicode", /\uFFFD/],
];

export function evaluateBehaviorally(input: BehavioralEvaluationInput): TestAssertionResult[] {
  const response = input.response?.trim() ?? "";
  const results: TestAssertionResult[] = [];
  results.push(check(input.stepId, "patient-role-fidelity", "Patient-role fidelity", !providerRolePatterns.some((pattern) => pattern.test(response)), "failure", "No strong provider-position language was detected.", "Strong provider-position language was detected."));

  for (const [label, pattern] of hardArtifactPatterns) {
    results.push(check(input.stepId, `artifact-${slug(label)}`, `No ${label}`, !pattern.test(response), "failure", `No ${label} was detected.`, `${label} was detected.`));
  }

  const looksLikeJson = looksLikeStructuredJson(response);
  results.push(check(input.stepId, "artifact-json", "No serialized JSON payload", !looksLikeJson, "failure", "The response was natural text, not a JSON payload.", "The response appears to be a serialized JSON object or array."));

  const unnecessaryOuterQuotes = hasMatchingOuterQuoteWrapper(response);
  results.push(check(input.stepId, "unnecessary-outer-quotes", "No unnecessary full-response quotation wrapper", !unnecessaryOuterQuotes, "failure", "The visible Patient response was not wrapped in quotation marks.", "The complete visible Patient response was wrapped in a matching pair of unnecessary quotation marks."));

  const repeatedPunctuation = /([!?.,])\1{4,}/.test(response);
  results.push(check(input.stepId, "punctuation", "No excessive repeated punctuation", !repeatedPunctuation, "warning", "Punctuation was within normal conversational bounds.", "Excessive repeated punctuation was detected."));

  const duplicateBlock = hasRepeatedSentenceBlock(response);
  results.push(check(input.stepId, "duplicate-block", "No repeated sentence block", !duplicateBlock, "failure", "No sentence block was repeated.", "A sentence block was repeated in the response."));

  const contradictionTopic = immediateContradictionTopic(response);
  results.push(check(input.stepId, "internal-contradiction", "No immediate internal contradiction", !contradictionTopic, "failure", "No direct yes/no contradiction was detected within the response.", `The response both affirmed and denied ${contradictionTopic}.`));

  const complete = response.length > 0 && !/[\p{L}\p{N}]-$/u.test(response) && !/\b(?:and|or|the|a|an|to|because|with)$/i.test(response);
  results.push(check(input.stepId, "complete-phrase", "Complete conversational phrase", complete, "warning", "The response appears complete.", "The response appears abruptly truncated."));

  const reasonableLength = response.length <= 1_500;
  results.push(check(input.stepId, "length", "Reasonable response length", reasonableLength, "warning", `Response length was ${response.length} characters.`, `Response length was excessive at ${response.length} characters.`, 1_500, response.length));

  const repeatedPrevious = Boolean(input.previousPatientResponse && normalize(response) === normalize(input.previousPatientResponse));
  results.push(check(input.stepId, "not-verbatim-repeat", "Not a verbatim repeat of the preceding Patient response", input.expectation.allowVerbatimPatientRepeat === true || !repeatedPrevious, "warning", "The response did not repeat the complete preceding Patient response.", "The complete preceding Patient response was repeated verbatim."));

  if (input.expectation.relevantTerms?.length) {
    const relevant = input.expectation.relevantTerms.some((term) => normalize(response).includes(normalize(term)));
    results.push(check(input.stepId, "question-relevance", "Deterministic question relevance", relevant, "warning", "The response contained a configured intent-equivalent term.", `None of the configured relevance terms appeared: ${input.expectation.relevantTerms.join(", ")}. This lexical heuristic is warning-only.`));
  }

  if (input.contract) results.push(...evaluateContract(input, response));
  return results;
}

export function collectDisclosedStableFacts(contract: CaseBehaviorContract | undefined, responses: readonly string[]): string[] {
  if (!contract) return [];
  return contract.stableFacts
    .filter((fact) => responses.some((response) => fact.acceptedPatterns.some((pattern) => pattern.test(response))))
    .map((fact) => fact.id);
}

function evaluateContract(input: BehavioralEvaluationInput, response: string): TestAssertionResult[] {
  const contract = input.contract!;
  const results: TestAssertionResult[] = [];
  for (const fact of contract.stableFacts) {
    const normalizedLocation = fact.canonicalLocation ? normalizeDentalLocation(response) : null;
    const contradicted = fact.canonicalLocation
      ? normalizedLocation !== null && normalizedLocation !== fact.canonicalLocation
      : !isSupportedHypothetical(response, fact.id) && fact.contradictionPatterns.some((pattern) => pattern.test(response));
    results.push(check(input.stepId, `case-fact-${fact.id}`, `No contradiction of ${fact.label}`, !contradicted, "failure", `${fact.label} was not contradicted.`, `The response contradicted the stable case fact: ${fact.label}.`));
    if (fact.canonicalDurationDays !== undefined && isDirectDurationQuestion(input.studentMessage)) {
      const actualDuration = normalizeDurationToDays(response);
      const expressesCanonicalDuration = fact.acceptedPatterns.some((pattern) => pattern.test(response));
      results.push(check(
        input.stepId,
        `case-fact-${fact.id}-canonical`,
        `Canonical ${fact.label}`,
        expressesCanonicalDuration || actualDuration === fact.canonicalDurationDays,
        "failure",
        `The response expressed the canonical ${fact.canonicalDurationDays}-day duration.`,
        `The response did not express the canonical ${fact.canonicalDurationDays}-day duration.`,
        fact.canonicalDurationDays,
        actualDuration ?? undefined,
      ));
    }
    if (fact.directQuestionPatterns && directlyAsksFact(input.studentMessage, fact.directQuestionPatterns) && directQuestionFactCount(input.studentMessage, contract) === 1) {
      const answered = fact.canonicalLocation
        ? normalizeDentalLocation(response) === fact.canonicalLocation
        : fact.acceptedPatterns.some((pattern) => pattern.test(response));
      results.push(check(
        input.stepId,
        `case-fact-${fact.id}-direct-answer`,
        `Direct answer: ${fact.label}`,
        answered,
        "failure",
        `The response directly expressed ${fact.label}.`,
        `The response did not directly express ${fact.label}.`,
      ));
    }
  }
  for (const rule of contract.progressiveDisclosure ?? []) {
    if (input.stepIndex >= rule.revealFromStep) continue;
    const leaked = rule.patterns.some((pattern) => pattern.test(response));
    results.push(check(input.stepId, `disclosure-${rule.id}`, `Progressive disclosure: ${rule.label}`, !leaked, "failure", `${rule.label} was not disclosed prematurely.`, `${rule.label} appeared before its permitted step.`));
  }
  if (input.stepIndex === 0 && contract.firstResponseFactLimit) {
    const disclosed = contract.stableFacts.filter((fact) => fact.acceptedPatterns.some((pattern) => pattern.test(response))).length;
    results.push(check(input.stepId, "first-response-fact-volume", "No full-history dump in first response", disclosed <= contract.firstResponseFactLimit, "warning", `${disclosed} configured stable fact(s) appeared in the first response.`, `${disclosed} configured stable facts appeared in the first response, above the limit of ${contract.firstResponseFactLimit}.`, contract.firstResponseFactLimit, disclosed));
  }
  return results;
}

function isSupportedHypothetical(response: string, factId: string): boolean {
  return factId === "fever" && (
    /\b(?:what if|if)\s+i\s+(?:have|get|develop)\s+(?:a\s+)?fever\b/i.test(response) ||
    /\bif\b[^.!?]{0,80}\bfever(?:ish)?\b/i.test(response)
  );
}

function isDirectDurationQuestion(value: string): boolean {
  return directlyAsksFact(value, [/\b(?:how long|duration|when.{0,20}(?:start|begin)|how many days)\b/i]);
}

function directlyAsksFact(value: string, patterns: readonly RegExp[]): boolean {
  return value.match(/(?:^|[.!])\s*[^.!?]*\?/g)?.some((clause) => patterns.some((pattern) => pattern.test(clause))) ?? false;
}

function directQuestionFactCount(value: string, contract: CaseBehaviorContract): number {
  return contract.stableFacts.filter((fact) => fact.directQuestionPatterns && directlyAsksFact(value, fact.directQuestionPatterns)).length;
}

function check(stepId: string, id: string, name: string, passed: boolean, failureSeverity: "warning" | "failure", passMessage: string, failMessage: string, expected?: number, actual?: number): TestAssertionResult {
  return { id: `${stepId}-${id}`, name, status: passed ? "passed" : "failed", severity: passed ? "info" : failureSeverity, message: passed ? passMessage : failMessage, expected, actual };
}

function looksLikeStructuredJson(value: string): boolean {
  if (!/^[\[{]/.test(value) || !/[\]}]$/.test(value)) return false;
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null; } catch { return false; }
}

function hasMatchingOuterQuoteWrapper(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  const pairs: Readonly<Record<string, string>> = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
  };
  return pairs[trimmed[0]] === trimmed.at(-1);
}

function hasRepeatedSentenceBlock(value: string): boolean {
  const sentences = value.split(/(?<=[.!?])\s+/).map(normalize).filter((item) => item.length >= 20);
  return new Set(sentences).size !== sentences.length;
}

function immediateContradictionTopic(value: string): string | null {
  const topics: ReadonlyArray<[string, RegExp]> = [
    ["swelling", /\b(?:swelling|swollen)\b/gi],
    ["fever", /\bfever(?:ish)?\b/gi],
  ];
  const clauses = splitIntoLocalClauses(value);
  for (const [topic, mentionPattern] of topics) {
    const polarities = clauses.flatMap((clause) => factPolarities(clause, mentionPattern));
    if (polarities.includes("affirmed") && polarities.includes("negated")) return topic;
  }
  const airway = interpretAirwayFactPolarities(value);
  if (airway.breathing.includes("affirmed") && airway.breathing.includes("negated")) return "breathing difficulty";
  if (airway.swallowing.includes("affirmed") && airway.swallowing.includes("negated")) return "swallowing difficulty";
  return null;
}

type FactPolarity = "affirmed" | "negated";

export function interpretAirwayFactPolarities(value: string): { breathing: FactPolarity[]; swallowing: FactPolarity[] } {
  const result: { breathing: FactPolarity[]; swallowing: FactPolarity[] } = { breathing: [], swallowing: [] };
  for (const clause of splitIntoLocalClauses(value)) {
    const normalized = normalize(clause);
    const coordinatedDenial = /\b(?:no|not|neither)\b.{0,45}\b(?:trouble|difficulty|hard time)?\s*(?:breath\w*)\b.{0,20}\b(?:or|nor|and)\s+(?:trouble |difficulty )?swallow\w*\b/.test(normalized);
    if (/\bbreath(?:e|ing)?\b/.test(normalized)) {
      const denied = coordinatedDenial || /\b(?:no|not|without)\b.{0,35}\b(?:trouble|difficulty|hard time)?\s*breath\w*\b/.test(normalized) || /\b(?:can|able to)\b.{0,15}\bbreath\w*\b.{0,15}\b(?:normally|fine|okay)\b/.test(normalized);
      result.breathing.push(denied ? "negated" : "affirmed");
    }
    if (/\bswallow(?:ing)?\b/.test(normalized)) {
      const explicitlyAffirmed = /\bswallow\w*\b.{0,12}\b(?:is|feels?)\b.{0,8}\b(?:difficult|hard|painful)\b|\b(?:hurts?|painful)\b.{0,8}\bto swallow\b/.test(normalized);
      const denied = !explicitlyAffirmed && (coordinatedDenial || /\b(?:no|not|without)\b.{0,35}\b(?:trouble|difficulty|hard time)?\s*swallow\w*\b/.test(normalized) || /\b(?:can|able to)\b.{0,15}\bswallow\w*\b.{0,15}\b(?:normally|fine|okay)\b/.test(normalized));
      result.swallowing.push(denied ? "negated" : "affirmed");
    }
  }
  return result;
}

function splitIntoLocalClauses(value: string): string[] {
  return value
    .split(/(?:[.!?;]+|\s*,?\s+\b(?:but|though|however|while)\b\s+)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function factPolarities(clause: string, mentionPattern: RegExp): FactPolarity[] {
  const polarities: FactPolarity[] = [];
  for (const match of clause.matchAll(mentionPattern)) {
    const mentionIndex = match.index ?? 0;
    const localPrefix = clause.slice(Math.max(0, mentionIndex - 55), mentionIndex);
    polarities.push(hasLocalNegation(localPrefix) ? "negated" : "affirmed");
  }
  return polarities;
}

function hasLocalNegation(prefix: string): boolean {
  const normalizedPrefix = normalize(prefix);
  return /\b(?:no|not|never|without)\b(?:\s+\w+){0,4}\s*$/.test(normalizedPrefix) ||
    /\b(?:don t|do not|haven t|have not|hasn t|has not|isn t|is not|wasn t|was not)\b(?:\s+\w+){0,5}\s*$/.test(normalizedPrefix);
}

function normalize(value: string): string { return value.toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function slug(value: string): string { return normalize(value).replace(/\s+/g, "-"); }
