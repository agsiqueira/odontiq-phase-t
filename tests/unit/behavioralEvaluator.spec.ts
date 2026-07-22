import { expect, test } from "@playwright/test";
import { collectDisclosedStableFacts, evaluateBehaviorally, interpretAirwayFactPolarities } from "../../src/evaluators/behavioralEvaluator.js";
import { case01BehaviorContract, case02BehaviorContract, case03BehaviorContract, case04BehaviorContract, case05BehaviorContract } from "../../src/scenarios/caseBehaviorContracts.js";
import { parseSemanticEvaluation } from "../../src/evaluators/semanticEvaluator.js";
import { normalizeDurationToDays } from "../../src/evaluators/durationNormalizer.js";
import { normalizeDentalLocation } from "../../src/evaluators/anatomicalLocationNormalizer.js";
import { behavioralScenarios } from "../../src/scenarios/behavioralScenarios.js";

const evaluate = (response: string, previousPatientResponse?: string) => evaluateBehaviorally({
  stepId: "turn-1", stepIndex: 0, studentMessage: "How are you?", response, previousPatientResponse,
  expectation: { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true },
});
const failed = (response: string, suffix: string) => evaluate(response).find((item) => item.id.endsWith(suffix))?.status;
const contradictionStatus = (response: string) => failed(response, "internal-contradiction");
const case02DurationStatus = (response: string) => evaluateBehaviorally({
  stepId: "duration-turn", stepIndex: 1, studentMessage: "When did it start?", response,
  expectation: { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true },
  contract: case02BehaviorContract,
}).find((item) => item.id.endsWith("case-fact-duration-canonical"))?.status;

test("accepts patient questions without confusing them for clinical instructions", () => {
  expect(failed("Will I need antibiotics? Should I see a specialist?", "patient-role-fidelity")).toBe("passed");
});
test("rejects strong provider-role behavior", () => {
  expect(failed("As your dentist, your diagnosis is an abscess and I will prescribe antibiotics.", "patient-role-fidelity")).toBe("failed");
  expect(failed("Take 500 mg twice a day.", "patient-role-fidelity")).toBe("failed");
});
test("detects leaked model metadata seen in black-box reports", () => {
  expect(failed('No swelling. turnPolicy.providerMessageIntent: "question"', "artifact-model-metadata")).toBe("failed");
});
test("detects observed simulation boundary and disclaimer leakage", () => {
  expect(evaluate("It began four days ago. End of simulation").some((item) => item.status === "failed" && item.id.includes("simulation-boundary"))).toBe(true);
  expect(evaluate("Legal Disclaimer: This is fictional.").some((item) => item.status === "failed" && item.id.includes("simulation-boundary"))).toBe(true);
});
test("detects JSON, markup, placeholders, code fences, and malformed Unicode", () => {
  expect(failed('{"answer":"pain"}', "artifact-json")).toBe("failed");
  expect(evaluate("<system>hidden</system>").some((item) => item.status === "failed" && item.id.includes("html-xml"))).toBe(true);
  expect(evaluate("{{PATIENT_RESPONSE}}").some((item) => item.status === "failed" && item.id.includes("placeholder"))).toBe(true);
  expect(evaluate("```json").some((item) => item.status === "failed" && item.id.includes("code-fence"))).toBe(true);
  expect(evaluate("I feel bad �").some((item) => item.status === "failed" && item.id.includes("unicode"))).toBe(true);
});
test("rejects matching outer quotation wrappers as a hard formatting failure", () => {
  for (const response of [
    '"My tooth hurts."',
    "'My tooth hurts.'",
    "“My tooth hurts.”",
    "‘My tooth hurts.’",
    '   "My tooth hurts."   ',
    '""',
  ]) {
    const assertion = evaluate(response).find((item) => item.id.endsWith("unnecessary-outer-quotes"));
    expect(assertion?.status, response).toBe("failed");
    expect(assertion?.severity, response).toBe("failure");
  }
});
test("preserves internal quotations, apostrophes, and unmatched quote characters", () => {
  for (const response of [
    "My tooth hurts.",
    'My wife said, "You should see a dentist."',
    'He called it the "worst pain ever."',
    "I said 'yes' when they asked.",
    "I haven't checked my temperature.",
    '"My tooth hurts.',
    'My tooth hurts."',
  ]) {
    expect(evaluate(response).find((item) => item.id.endsWith("unnecessary-outer-quotes"))?.status, response).toBe("passed");
  }
});
test("does not reject ordinary clinical punctuation, abbreviations, or numbers", () => {
  expect(evaluate("It's an 8/10 ache near tooth No. 3.").filter((item) => item.severity === "failure" && item.status === "failed")).toEqual([]);
});
test("flags complete prior-response repetition and repeated sentence blocks", () => {
  const text = "My upper-right tooth hurts badly.";
  expect(evaluate(text, text).find((item) => item.id.endsWith("not-verbatim-repeat"))?.status).toBe("failed");
  expect(failed(`${text} ${text}`, "duplicate-block")).toBe("failed");
});
test("detects a direct contradiction within one response without mixing separate topics", () => {
  expect(contradictionStatus("No, I have no swelling, but yes, I have noticed swelling.")).toBe("failed");
  expect(contradictionStatus("No swelling, but I do feel feverish.")).toBe("passed");
});
test("keeps temperature measurement negation local to its clause", () => {
  expect(contradictionStatus("Yes, I've been feeling quite feverish and very hot, though I haven't checked my temperature. The swelling is making it very difficult to swallow and breathe when I lie down.")).toBe("passed");
  expect(contradictionStatus("I haven't checked my temperature, but I feel feverish.")).toBe("passed");
});
test("does not affirm the same swelling mention that is locally negated", () => {
  expect(contradictionStatus("No, I haven't noticed any swelling yet.")).toBe("passed");
  expect(contradictionStatus("I don't have swelling, but I do have trouble swallowing.")).toBe("passed");
  expect(contradictionStatus("No swelling or fever.")).toBe("passed");
});
test("allows an explicitly resolved symptom progression", () => {
  expect(contradictionStatus("I had swelling yesterday, but it is gone now.")).toBe("passed");
});
test("still detects genuine same-fact contradictions across local clauses", () => {
  expect(contradictionStatus("I don't have swelling, but my jaw is swollen.")).toBe("failed");
  expect(contradictionStatus("I have felt feverish, but no fever now.")).toBe("failed");
});
test("strict semantic parser requires all seven scored dimensions", () => {
  const item = { score: 2 as const, reason: "Pass" };
  const valid = { patientRoleFidelity: item, questionRelevance: item, caseConsistency: item, naturalPatientDialogue: item, artifactFree: item, disclosureCompliance: item, clinicalSafety: item };
  expect(parseSemanticEvaluation(valid).clinicalSafety.score).toBe(2);
  expect(() => parseSemanticEvaluation({ ...valid, clinicalSafety: { score: 3, reason: "bad" } })).toThrow(/invalid clinicalSafety score/);
});
test("tracks only explicitly disclosed stable facts across the current run", () => {
  expect(collectDisclosedStableFacts(case02BehaviorContract, ["My upper-right tooth hurts.", "It began about a week ago."])).toEqual(["location", "duration"]);
});

test("accepts semantic equivalents of the canonical seven-day Case 2 duration", () => {
  for (const response of ["It started seven days ago.", "It has been hurting for 7 days.", "It started about a week ago.", "It began approximately one week ago."])
    expect(case02DurationStatus(response), response).toBe("passed");
});

test("rejects non-canonical and arbitrary Case 2 durations", () => {
  for (const response of ["It started two days ago.", "It began a couple of days ago.", "The pain started yesterday.", "It started three weeks ago.", "It has been going on for five months."])
    expect(case02DurationStatus(response), response).toBe("failed");
});

test("normalizes bounded duration expressions to canonical day values", () => {
  for (const value of ["one week", "about a week", "around one week", "roughly one week", "seven days", "7 days"])
    expect(normalizeDurationToDays(value), value).toBe(7);
  for (const value of ["two days", "about two days", "around two days", "a couple of days"])
    expect(normalizeDurationToDays(value), value).toBe(2);
  expect(normalizeDurationToDays("three weeks")).toBe(21);
  expect(normalizeDurationToDays("one month")).toBe(30);
  expect(normalizeDurationToDays("I'm not sure.")).toBeNull();
});

test("requires the canonical duration on a direct Case 2 duration question", () => {
  expect(case02DurationStatus("It started about a week ago.")).toBe("passed");
  expect(case02DurationStatus("It started a couple of days ago.")).toBe("failed");
  expect(case02DurationStatus("I'm not sure about that.")).toBe("failed");
});

test("keeps the canonical Case 4 course when supported secondary timing is also stated", () => {
  const results = evaluateBehaviorally({
    stepId: "case4-duration",
    stepIndex: 1,
    studentMessage: "How long has the returned pain been worsening?",
    response: "It has worsened for about five days, especially over the last 48 hours; the earlier severe episode was about a week ago.",
    expectation: { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true },
    contract: case04BehaviorContract,
  });
  expect(results.find((item) => item.id.endsWith("case-fact-duration-canonical"))?.status).toBe("passed");
});

test("Case 4 contract distinguishes its three timelines and suspected filling break", () => {
  const sequence = case04BehaviorContract.stableFacts.find((fact) => fact.id === "sequence")!;
  expect(sequence.acceptedPatterns.some((pattern) => pattern.test("It hurt a week ago, stopped, and then returned."))).toBe(true);
  expect(sequence.acceptedPatterns.some((pattern) => pattern.test("It became sharper over the past 48 hours."))).toBe(true);
  expect(sequence.contradictionPatterns.some((pattern) => pattern.test("It has been continuous without stopping for a week."))).toBe(true);
  const filling = case04BehaviorContract.stableFacts.find((fact) => fact.id === "filling")!;
  expect(filling.acceptedPatterns.some((pattern) => pattern.test("I think the old filling may have broken."))).toBe(true);
  expect(filling.contradictionPatterns.some((pattern) => pattern.test("The filling definitely broke."))).toBe(true);
});

test("does not treat a Case 3 hypothetical safety question as current fever", () => {
  const results = evaluateBehaviorally({
    stepId: "case3-safety",
    stepIndex: 4,
    studentMessage: "Return urgently for fever. What concerns do you have?",
    response: "I understand. What if I develop a fever?",
    expectation: { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true },
    contract: case03BehaviorContract,
  });
  expect(results.find((item) => item.id.endsWith("case-fact-fever"))?.status).toBe("passed");
});

test("Case 1 allergy negation is not treated as affirmative allergy", () => {
  const allergies = case01BehaviorContract.stableFacts.find((fact) => fact.id === "allergies")!;
  expect(allergies.contradictionPatterns.some((pattern) => pattern.test("I'm not allergic to penicillin."))).toBe(false);
  expect(allergies.contradictionPatterns.some((pattern) => pattern.test("I'm allergic to penicillin."))).toBe(true);
});

test("Case 1 distinguishes opioid use and misuse while rejecting affirmative history", () => {
  const opioid = case01BehaviorContract.stableFacts.find((fact) => fact.id === "opioid-history")!;
  for (const denial of [
    "No, I have never used opioids.",
    "I have not taken narcotics before.",
    "No, I have no history of prescription opioid misuse.",
    "I have never been dependent on opioids.",
    "No, I've never used opioids, nor have I had any issues with misuse or dependence.",
  ]) expect(opioid.acceptedPatterns.some((pattern) => pattern.test(denial)), denial).toBe(true);
  for (const contradiction of [
    "Yes, I have used opioids before.",
    "I have a history of opioid use.",
    "I took narcotics before.",
    "I was dependent on opioids.",
  ]) expect(opioid.contradictionPatterns.some((pattern) => pattern.test(contradiction)), contradiction).toBe(true);
});

test("Case 5 allergy negation is not treated as an affirmative allergy", () => {
  const allergies = case05BehaviorContract.stableFacts.find((fact) => fact.id === "allergies")!;
  const denial = "I don't have any known drug allergies, and I'm not allergic to penicillin.";
  expect(allergies.acceptedPatterns.some((pattern) => pattern.test(denial))).toBe(true);
  expect(allergies.contradictionPatterns.some((pattern) => pattern.test(denial))).toBe(false);
  expect(allergies.contradictionPatterns.some((pattern) => pattern.test("I'm allergic to penicillin."))).toBe(true);
});

test("Case 3 conditional safety-net fever language is not treated as present fever", () => {
  const result = evaluateBehaviorally({
    contract: case03BehaviorContract,
    stepId: "safety-net",
    stepIndex: 4,
    studentMessage: "Return urgently for swelling, fever, or trouble swallowing.",
    response: "I'll return if I have swelling, fever, or trouble swallowing.",
    expectation: { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true },
  });
  expect(result.find((assertion) => assertion.id.endsWith("case-fact-fever"))?.status).toBe("passed");
});

test("Case 3 contract protects cold, radiation, and uncertain root-canal history", () => {
  const cold = case03BehaviorContract.stableFacts.find((fact) => fact.id === "cold")!;
  expect(cold.acceptedPatterns.some((pattern) => pattern.test("No, cold drinks do not make it hurt."))).toBe(true);
  expect(cold.contradictionPatterns.some((pattern) => pattern.test("Cold makes it hurt."))).toBe(true);
  const radiation = case03BehaviorContract.stableFacts.find((fact) => fact.id === "radiation")!;
  expect(radiation.acceptedPatterns.some((pattern) => pattern.test("It travels toward my right ear."))).toBe(true);
  expect(radiation.contradictionPatterns.some((pattern) => pattern.test("It goes to my left ear."))).toBe(true);
  const rootCanal = case03BehaviorContract.stableFacts.find((fact) => fact.id === "root-canal")!;
  expect(rootCanal.acceptedPatterns.some((pattern) => pattern.test("I'm not sure whether it had a root canal."))).toBe(true);
  expect(rootCanal.contradictionPatterns.some((pattern) => pattern.test("I definitely had a root canal."))).toBe(true);
});

test("defines four behavioral styles for each of Cases 1 through 5", () => {
  expect(behavioralScenarios).toHaveLength(20);
  for (const caseId of ["case-01", "case-02", "case-03", "case-04", "case-05"])
    expect(behavioralScenarios.filter((scenario) => scenario.caseId === caseId).map((scenario) => scenario.behavioralStyle).sort()).toEqual(["compound-imperfect", "short-direct", "standard-clinical", "treatment-closing"]);
});

test("normalizes bounded dental laterality and arch expressions", () => {
  expect(normalizeDentalLocation("the lower-right back tooth")).toBe("lower-right");
  expect(normalizeDentalLocation("right mandibular posterior molar")).toBe("lower-right");
  expect(normalizeDentalLocation("left lower first molar")).toBe("lower-left");
  expect(normalizeDentalLocation("maxillary tooth on the left")).toBe("upper-left");
  expect(normalizeDentalLocation("a back tooth")).toBeNull();
});

test("new case contracts accept canonical facts and reject substitutions", () => {
  const checks = [
    [case03BehaviorContract, "It has worsened for three days.", "It started five days ago."],
    [case04BehaviorContract, "The returned pain has worsened for five days.", "It returned two days ago."],
    [case05BehaviorContract, "It has worsened for four days.", "It started one week ago."],
  ] as const;
  for (const [contract, canonical, contradiction] of checks) {
    const duration = contract.stableFacts.find((fact) => fact.id === "duration")!;
    expect(duration.acceptedPatterns.some((pattern) => pattern.test(canonical)), canonical).toBe(true);
    expect(duration.contradictionPatterns.some((pattern) => pattern.test(contradiction)), contradiction).toBe(true);
  }
});

test("new contracts preserve case-specific allergy and symptom facts", () => {
  expect(case03BehaviorContract.stableFacts.find((fact) => fact.id === "allergies")!.contradictionPatterns.some((pattern) => pattern.test("I am allergic to penicillin."))).toBe(true);
  expect(case04BehaviorContract.stableFacts.find((fact) => fact.id === "penicillin")!.acceptedPatterns.some((pattern) => pattern.test("Penicillin gives me hives."))).toBe(true);
  expect(case05BehaviorContract.stableFacts.find((fact) => fact.id === "cold")!.contradictionPatterns.some((pattern) => pattern.test("Cold relieves the pain."))).toBe(true);
});

test("Case 4 keeps penicillin allergy separate from denial of other allergies", () => {
  const penicillin = case04BehaviorContract.stableFacts.find((fact) => fact.id === "penicillin")!;
  for (const response of [
    "I get hives from penicillin, but no other allergies.",
    "Penicillin gives me hives.",
    "I am allergic to penicillin.",
  ]) {
    expect(penicillin.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
    expect(penicillin.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
  }
  for (const response of ["I have no allergies.", "I'm not allergic to penicillin."])
    expect(penicillin.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
});

test("Case 5 cold contract accepts lingering pain whether cold is mentioned before or after it", () => {
  const cold = case05BehaviorContract.stableFacts.find((fact) => fact.id === "cold")!;
  for (const response of [
    "Cold makes the pain worse and it lingers afterward.",
    "Yes, the pain does linger a bit even after the cold sensation is gone.",
  ]) expect(cold.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  expect(cold.acceptedPatterns.some((pattern) => pattern.test("Yes, it does. The pain didn't go away immediately after I removed the cold; it stayed for a bit afterward."))).toBe(true);
  expect(cold.acceptedPatterns.some((pattern) => pattern.test("Cold makes the pain worse."))).toBe(false);
  expect(cold.contradictionPatterns.some((pattern) => pattern.test("Cold relieves the pain."))).toBe(true);
});

test("Case 5 cold contract accepts persistence after cold but not cold sensitivity alone", () => {
  const cold = case05BehaviorContract.stableFacts.find((fact) => fact.id === "cold")!;
  for (const response of [
    "The pain lasts even after I remove the cold.",
    "The pain lasts after I remove the cold.",
    "The pain continues after I remove the cold.",
    "It remains after the cold is removed.",
    "It persists after the cold is removed.",
    "It doesn't stop immediately after the cold is gone.",
    "It keeps hurting after the cold is removed.",
  ]) expect(cold.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of ["Cold hurts.", "Cold makes it worse.", "It hurts with cold."])
    expect(cold.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
});

test("Case 5 cold contract recognizes the post-cold persistence relation without enumerating verbs", () => {
  const cold = case05BehaviorContract.stableFacts.find((fact) => fact.id === "cold")!;
  for (const response of [
    "Yes, cold drinks make it much worse, and the pain sticks around even after I take the cold away for a little while.",
    "Cold makes it worse, and the pain hangs around after I remove the cold.",
    "Cold makes it worse, and it lingers after the cold is gone.",
    "Cold makes it worse, and the pain lasts after I remove the cold.",
    "Cold makes it worse, and it continues after the cold is removed.",
    "Cold makes it worse, and the pain remains after the cold is gone.",
    "Cold makes it worse, and it persists after the cold is removed.",
    "Cold makes it worse, and the pain keeps hurting after the cold is removed.",
    "Cold makes it worse, and it doesn't go away after the cold is gone.",
  ]) expect(cold.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of ["Cold hurts.", "Cold makes it worse.", "It hurts with cold."])
    expect(cold.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
});

test("stable negative fever facts distinguish explicit denial from affirmative history", () => {
  for (const [contract, denial] of [
    [case03BehaviorContract, "No, I have not had a fever."],
    [case04BehaviorContract, "No, I have not had fever or chills."],
  ] as const) {
    const fever = contract.stableFacts.find((fact) => fact.id === "fever")!;
    expect(fever.acceptedPatterns.some((pattern) => pattern.test(denial))).toBe(true);
    expect(fever.contradictionPatterns.some((pattern) => pattern.test(denial))).toBe(false);
    expect(fever.contradictionPatterns.some((pattern) => pattern.test("I did have a fever."))).toBe(true);
  }
});

test("Case 4 accepts exact natural 7/10 equivalents and rejects other values", () => {
  const severity = case04BehaviorContract.stableFacts.find((fact) => fact.id === "severity")!;
  for (const response of [
    "The pain is constant, and it's quite severe, about a 7 on a ten-point scale.",
    "7/10",
    "7 out of 10",
    "seven out of ten",
    "7 on a ten scale",
    "7 on a ten-point scale",
    "seven on a ten-point scale",
    "It's about a 7 on a pain scale of 10.",
    "7 on a scale of 10.",
    "7 on a ten-point pain scale.",
  ])
    expect(severity.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of [
    "6/10", "6 out of 10", "six out of ten", "6 on a ten-point scale", "six on a ten-point scale",
    "8/10", "8 out of 10", "eight out of ten", "8 on a ten-point scale", "eight on a ten-point scale",
    "9/10", "9 out of 10", "nine out of ten", "9 on a ten-point scale", "nine on a ten-point scale",
    "6 on a pain scale of 10.", "8 on a pain scale of 10.", "9 on a pain scale of 10.",
  ]) {
    expect(severity.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
    expect(severity.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  }
  expect(severity.acceptedPatterns.some((pattern) => pattern.test("Severe pain."))).toBe(false);
});

test("Case 4 preserves historical cold pain while accepting no current cold pain", () => {
  const cold = case04BehaviorContract.stableFacts.find((fact) => fact.id === "cold-current")!;
  const response = "Cold used to hurt that tooth a while ago. Cold is not painful now, although it used to hurt.";
  expect(cold.acceptedPatterns.some((pattern) => pattern.test(response))).toBe(true);
  expect(cold.contradictionPatterns.some((pattern) => pattern.test(response))).toBe(false);
  expect(cold.contradictionPatterns.some((pattern) => pattern.test("Cold is still painful now."))).toBe(true);
});

test("Case 5 accepts conversational exact 9/10 answers and rejects non-nine or nonnumeric answers", () => {
  const severity = case05BehaviorContract.stableFacts.find((fact) => fact.id === "severity")!;
  for (const response of [
    "It's a nine, it's really severe.",
    "It's nine.",
    "About a nine.",
    "Around a nine.",
    "It's nine out of ten.",
    "9 out of 10.",
    "9/10.",
    "Nine on a ten-point scale.",
    "Nine on a pain scale of 10.",
  ]) expect(severity.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of ["It's an eight.", "It's a ten.", "It's really severe.", "Very painful."])
    expect(severity.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
});

test("Case 5 contract accepts plain NKDA wording and rejects denial of canonical smoking", () => {
  const allergies = case05BehaviorContract.stableFacts.find((fact) => fact.id === "allergies")!;
  const smoking = case05BehaviorContract.stableFacts.find((fact) => fact.id === "smoking")!;
  expect(allergies.acceptedPatterns.some((pattern) => pattern.test("I don't have any allergies."))).toBe(true);
  expect(smoking.acceptedPatterns.some((pattern) => pattern.test("I smoke about half a pack per day."))).toBe(true);
  expect(smoking.contradictionPatterns.some((pattern) => pattern.test("I don't smoke."))).toBe(true);
});

test("Case 2 contract requires progressive right-cheek swelling", () => {
  const swelling = case02BehaviorContract.stableFacts.find((fact) => fact.id === "swelling")!;
  for (const response of [
    "My right cheek is swollen.",
    "There is swelling on the right side of my face.",
    "My right cheek has been getting more swollen.",
  ]) expect(swelling.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of [
    "No swelling.",
    "My left cheek is swollen.",
    "There is lower-left facial swelling.",
    "The swelling resolved.",
  ]) expect(swelling.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
});

test("interprets coordinated and contrastive airway polarity clause-locally", () => {
  expect(interpretAirwayFactPolarities("No, I'm not having trouble breathing or swallowing.")).toEqual({ breathing: ["negated"], swallowing: ["negated"] });
  expect(interpretAirwayFactPolarities("I'm not having trouble breathing, but swallowing is difficult.")).toEqual({ breathing: ["negated"], swallowing: ["affirmed"] });
  expect(interpretAirwayFactPolarities("I can breathe normally, but it hurts to swallow.")).toEqual({ breathing: ["negated"], swallowing: ["affirmed"] });
  expect(interpretAirwayFactPolarities("I am having trouble breathing and swallowing.")).toEqual({ breathing: ["affirmed"], swallowing: ["affirmed"] });
  expect(interpretAirwayFactPolarities("No, I'm not having trouble breathing or swallowing, but my right cheek is swollen. I'm feeling feverish and weak though.")).toEqual({ breathing: ["negated"], swallowing: ["negated"] });
});

test("accepts the canonical Case 1 positional breathing distinction", () => {
  expect(contradictionStatus("No, I'm not short of breath while sitting upright. It's only when I lie down that I have trouble breathing and swallowing.")).toBe("passed");
});

test("Case 5 separates patient tooth knowledge from the examination finding", () => {
  const exactTooth = case05BehaviorContract.stableFacts.find((fact) => fact.id === "exact-tooth")!;
  expect(exactTooth.acceptedPatterns.some((pattern) => pattern.test("I can't tell which exact tooth is causing it."))).toBe(true);
  expect(exactTooth.contradictionPatterns.some((pattern) => pattern.test("I definitely know it is the first molar."))).toBe(true);
});

test("Case 5 distinguishes historical upper extraction from current lower-left pain", () => {
  const location = case05BehaviorContract.stableFacts.find((fact) => fact.id === "location")!;
  for (const response of [
    "I had an upper tooth extracted years ago, but this pain is in my lower-left jaw.",
    "The extraction was an upper tooth.",
    "My last dental visit was five years ago for an upper-tooth extraction.",
  ]) expect(location.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
  for (const response of [
    "The pain is in my upper jaw.",
    "The painful tooth is on the upper right.",
    "It hurts in the upper-left area.",
  ]) expect(location.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
});

test("Case 5 accepts natural lower-left direct answers and rejects other current locations", () => {
  const location = case05BehaviorContract.stableFacts.find((fact) => fact.id === "location")!;
  for (const response of [
    "It's on the left side, near the bottom.",
    "The pain is on the lower left.",
    "It's on the left side of my lower jaw.",
    "It's on the bottom left.",
    "It's on the lower-left side.",
    "It's on the lower part of the left side.",
    "It's on the left side down low.",
  ]) expect(location.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  for (const response of [
    "It's on the upper left.",
    "It's on the upper right.",
    "It's on the lower right.",
    "It's on the right side.",
    "It's in the upper jaw.",
  ]) {
    expect(location.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
    expect(location.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
  }
});

test("Case 4 fever matcher keeps explicit denial separate from affirmative symptoms", () => {
  const fever = case04BehaviorContract.stableFacts.find((fact) => fact.id === "fever")!;
  for (const response of [
    "I have no fever or chills.",
    "No fever or chills.",
    "I do not have a fever or chills.",
    "I haven't had fever or chills.",
  ]) {
    expect(fever.acceptedPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
    expect(fever.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(false);
  }
  for (const response of ["I have fever and chills.", "I did have a fever.", "I've been having chills."])
    expect(fever.contradictionPatterns.some((pattern) => pattern.test(response)), response).toBe(true);
});
