import type { CaseBehaviorContract, ScenarioExpectation, ScenarioStep, TestScenario } from "../types/scenario.js";
import { case01BehaviorContract, case02BehaviorContract, case03BehaviorContract, case04BehaviorContract, case05BehaviorContract } from "./caseBehaviorContracts.js";

const baseExpectation: ScenarioExpectation = { requiredPhrases: [], prohibitedPhrases: [], maximumResponseTimeMs: 30_000, requiresPatientRoleEvaluation: true };
const step = (id: string, studentMessage: string, relevantTerms: readonly string[] = []): ScenarioStep => ({ id, studentMessage, expectation: { ...baseExpectation, relevantTerms, semanticIntent: relevantTerms.length ? `Respond about ${relevantTerms.join(" or ")}.` : "Respond naturally as the patient." } });

function scenario(caseId: `case-0${1 | 2 | 3 | 4 | 5}`, patientName: string, style: NonNullable<TestScenario["behavioralStyle"]>, contract: CaseBehaviorContract, steps: readonly ScenarioStep[]): TestScenario {
  return { id: `${caseId}-behavior-${style}`, name: `${patientName}: ${style.replace(/-/g, " ")}`, caseId, patientName, encounterPath: `/encounter/${caseId}`, attemptPolicy: "prefer-new", behavioralStyle: style, caseContract: contract, steps };
}

const case01 = {
  id: "case-01" as const, patient: "Amara Johnson", contract: case01BehaviorContract,
};
const case02 = {
  id: "case-02" as const, patient: "Marcus Lee", contract: case02BehaviorContract,
};
const case03 = { id: "case-03" as const, patient: "Elena Garcia", contract: case03BehaviorContract };
const case04 = { id: "case-04" as const, patient: "Noah Patel", contract: case04BehaviorContract };
const case05 = { id: "case-05" as const, patient: "Sofia Williams", contract: case05BehaviorContract };

export const behavioralScenarios: readonly TestScenario[] = [
  scenario(case01.id, case01.patient, "standard-clinical", case01.contract, [
    step("c01-standard-01-introduction", "Hello Amara, I'm your dental clinician today. What brings you in?", ["pain", "tooth", "ache", "swelling"]),
    step("c01-standard-02-onset", "When did it begin and how long has it been present?", ["four", "4", "day"]),
    step("c01-standard-03-location", "Where is the pain and swelling located?", ["tooth", "jaw", "face", "mouth"]),
    step("c01-standard-04-severity", "How severe is the pain from zero to ten?", ["8", "eight", "severe"]),
    step("c01-standard-05-associated", "Do you have fever, swelling, or trouble breathing or swallowing?", ["fever", "swelling", "swallow", "breath"]),
    step("c01-standard-06-history", "What medical or dental conditions do you have?", ["diabetes", "hypertension", "blood pressure"]),
    step("c01-standard-07-medications", "What medications are you taking, and do you have medication allergies?", ["metformin", "lisinopril", "allerg"]),
    step("c01-standard-07a-opioid-use", "Have you ever used opioids?", ["no", "never", "opioid"]),
    step("c01-standard-07b-opioid-history", "Do you have a history of opioid use?", ["no", "opioid", "history"]),
    step("c01-standard-07c-leading-narcotics", "So you have taken narcotics before, correct?", ["no", "not", "never", "narcotic"]),
    step("c01-standard-07d-opioid-misuse", "Any history of prescription opioid misuse?", ["no", "opioid", "misuse"]),
    step("c01-standard-08-plan", "These symptoms need urgent emergency assessment today. Do you understand that plan?", ["understand", "okay", "yes", "worried", "question"]),
    step("c01-standard-09-safety", "Please seek immediate help if breathing or swallowing worsens.", ["understand", "will", "okay", "thank"]),
    step("c01-standard-10-closing", "Thank you, Amara. Is there anything you need clarified before we finish?"),
  ]),
  scenario(case01.id, case01.patient, "short-direct", case01.contract, [
    step("c01-short-01-chief", "What hurts?", ["pain", "tooth", "ache", "hurt"]), step("c01-short-02-onset", "When did it start?", ["four", "4", "day"]), step("c01-short-03-location", "Where does it hurt?", ["tooth", "jaw", "face", "mouth"]), step("c01-short-04-severity", "How bad is it?", ["8", "eight", "severe", "bad"]), step("c01-short-05-swelling", "Any swelling?", ["swell"]), step("c01-short-06-meds", "Any medications or allergies?", ["metformin", "lisinopril", "ibuprofen", "allerg"]),
  ]),
  scenario(case01.id, case01.patient, "compound-imperfect", case01.contract, [
    step("c01-imperfect-01-compound", "where pain at and when it start?", ["tooth", "jaw", "four", "4", "day"]), step("c01-imperfect-02-vague", "What about that?"), step("c01-imperfect-03-repeat", "Sorry, when did this begin again?", ["four", "4", "day"]), step("c01-imperfect-04-clinical", "Any dysphagia, dyspnea, or systemic pyrexia?", ["swallow", "breath", "fever", "hot"]), step("c01-imperfect-05-two-part", "Do you have medical conditions and what medicines do you take?", ["diabetes", "hypertension", "metformin", "lisinopril"]),
  ]),
  scenario(case01.id, case01.patient, "treatment-closing", case01.contract, [
    step("c01-plan-01-diagnosis", "I'm concerned this may be a serious spreading dental infection."), step("c01-plan-02-treatment", "I propose urgent assessment, pain control, and treatment of the source today."), step("c01-plan-03-referral", "I recommend immediate referral to emergency care because of your airway symptoms."), step("c01-plan-04-safety", "If breathing or swallowing worsens, call emergency services immediately."), step("c01-plan-05-close", "That is our plan. What questions or concerns do you have before we close?"),
  ]),
  scenario(case02.id, case02.patient, "standard-clinical", case02.contract, [
    step("c02-standard-01-introduction", "Hello Marcus, I'm your dental clinician. What is bothering you most?", ["pain", "tooth", "hurt", "ache"]), step("c02-standard-02-onset", "When did it begin and how long has it lasted?", ["seven", "7", "week"]), step("c02-standard-03-location", "Where exactly is the pain?", ["upper-right", "upper right"]), step("c02-standard-04-severity", "How severe is it?", ["severe", "bad", "worse"]), step("c02-standard-05-associated", "Any fever, weakness, swelling, or trouble breathing or swallowing?", ["fever", "weak", "no", "haven't"]), step("c02-standard-06-history", "Any relevant medical or dental history?"), step("c02-standard-07-medications", "What medications do you take, and do you have allergies?"), step("c02-standard-08-plan", "This needs prompt dental evaluation and treatment. Does that plan make sense?", ["yes", "understand", "okay", "question"]), step("c02-standard-09-safety", "Seek urgent help if swelling or breathing or swallowing trouble develops."), step("c02-standard-10-closing", "Thank you, Marcus. What questions do you have before we finish?"),
  ]),
  scenario(case02.id, case02.patient, "short-direct", case02.contract, [
    step("c02-short-01-chief", "What hurts?", ["pain", "tooth", "hurt", "ache"]), step("c02-short-02-onset", "When did it start?", ["seven", "7", "week"]), step("c02-short-03-location", "Where does it hurt?", ["upper-right", "upper right"]), step("c02-short-04-severity", "How bad is it?", ["severe", "bad", "worse"]), step("c02-short-05-swelling", "Any swelling?", ["no", "haven't"]), step("c02-short-06-meds", "Any medications?"),
  ]),
  scenario(case02.id, case02.patient, "compound-imperfect", case02.contract, [
    step("c02-imperfect-01-compound", "where hurt and when start?", ["upper-right", "upper right", "seven", "7", "week"]), step("c02-imperfect-02-vague", "And that other thing?"), step("c02-imperfect-03-repeat", "Tell me again where the tooth hurts.", ["upper-right", "upper right"]), step("c02-imperfect-04-clinical", "Any pyrexia, dysphagia, dyspnea, or edema?", ["fever", "swallow", "breath", "swelling", "no"]), step("c02-imperfect-05-two-part", "You feel weak too and has this worsened?", ["weak", "worse", "yes"]),
  ]),
  scenario(case02.id, case02.patient, "treatment-closing", case02.contract, [
    step("c02-plan-01-diagnosis", "Your symptoms may represent an acute dental infection."), step("c02-plan-02-treatment", "I propose prompt dental treatment and appropriate medication after assessment."), step("c02-plan-03-referral", "I recommend referral if the infection cannot be managed here."), step("c02-plan-04-safety", "Seek urgent help if swelling or breathing or swallowing difficulty begins."), step("c02-plan-05-close", "That is the plan. What concerns or questions do you have before we close?"),
  ]),
  scenario(case03.id, case03.patient, "standard-clinical", case03.contract, [
    step("c03-standard-01-chief", "Hello Elena, what is bothering you most?", ["pain", "tooth", "chew"]),
    step("c03-standard-02-location-duration", "Where is the pain, and how long has it been worsening?", ["right", "lower", "three", "3", "day"]),
    step("c03-standard-03-character", "Is it constant, what does it feel like, and how bad is it out of ten?", ["constant", "throbbing", "8", "eight"]),
    step("c03-standard-04-associated", "Does chewing hurt, and have you had facial swelling, fever, trouble breathing, or trouble swallowing?", ["chew", "puffy", "fever", "breath", "swallow"]),
    step("c03-standard-05-history", "What medical conditions, medications, and drug allergies do you have?", ["ulcer", "Pepcid", "allerg"]),
    step("c03-standard-06-nsaid", "Does ibuprofen, Advil, or Motrin bother your stomach?", ["stomach", "upset", "ulcer"]),
    step("c03-standard-07-plan", "This abscess needs drainage or source control, appropriate medicine, and definitive dental follow-up. Does that plan make sense?", ["yes", "understand", "okay", "question"]),
    step("c03-standard-08-safety", "Seek urgent help for worsening swelling, fever, swallowing, breathing, or voice problems."),
  ]),
  scenario(case03.id, case03.patient, "short-direct", case03.contract, [
    step("c03-short-01-chief", "What hurts?", ["tooth", "pain"]), step("c03-short-02-location", "Where?", ["right", "lower"]), step("c03-short-03-duration", "How long?", ["three", "3", "day"]), step("c03-short-04-severity", "Pain out of ten?", ["8", "eight"]), step("c03-short-05-redflags", "Fever, swelling, breathing, or swallowing trouble?", ["fever", "puffy", "breath", "swallow"]), step("c03-short-06-meds", "Ulcers, medicines, allergies, and ibuprofen tolerance?", ["ulcer", "Pepcid", "ibuprofen", "allerg"]),
  ]),
  scenario(case03.id, case03.patient, "compound-imperfect", case03.contract, [
    step("c03-imperfect-01", "where tooth and how many days?", ["right", "lower", "three", "3"]), step("c03-imperfect-02", "how bad and what feel like?", ["8", "throbbing", "constant"]), step("c03-imperfect-03", "chewing and does it go anywhere?", ["chew", "ear"]), step("c03-imperfect-04", "fever dysphagia dyspnea or face puffy?", ["fever", "swallow", "breath", "puffy"]), step("c03-imperfect-05", "medical stuff meds allergies and can take advil?", ["ulcer", "Pepcid", "allerg", "stomach"]),
  ]),
  scenario(case03.id, case03.patient, "treatment-closing", case03.contract, [
    step("c03-plan-01", "The findings are concerning for a periapical abscess."), step("c03-plan-02", "We need source control or drainage and an antibiotic appropriate for you."), step("c03-plan-03", "Because ibuprofen upsets your stomach, we will account for that when discussing pain relief."), step("c03-plan-04", "You still need definitive dental follow-up even after emergency treatment."), step("c03-plan-05", "Return urgently for spreading swelling, fever, trouble swallowing or breathing. What concerns do you have?"),
  ]),
  scenario(case04.id, case04.patient, "standard-clinical", case04.contract, [
    step("c04-standard-01-chief", "Hello Noah, what is bothering you most?", ["pain", "tooth", "bite"]), step("c04-standard-02-location-duration", "Where is the pain and how long has the returned pain been worsening?", ["left", "lower", "five", "5", "day"]), step("c04-standard-03-sequence", "Did the pain stop and return, and could an old filling have failed?", ["stopped", "returned", "filling"]), step("c04-standard-04-character", "Is it constant, how bad is it out of ten, and does biting hurt?", ["constant", "7", "seven", "bite"]), step("c04-standard-05-associated", "Do you have swelling, drainage, fever, trouble swallowing, or trouble breathing?", ["no", "swelling", "drain", "fever"]), step("c04-standard-06-allergy", "Do you have medication allergies, and what reaction does penicillin cause?", ["penicillin", "hives"]), step("c04-standard-07-cold", "Cold hurt before; does cold still cause pain now?", ["no", "cold"]), step("c04-standard-08-plan", "This needs urgent definitive dental care, but antibiotics are not indicated without infection signs. Does that make sense?", ["yes", "understand", "okay", "question"]),
  ]),
  scenario(case04.id, case04.patient, "short-direct", case04.contract, [
    step("c04-short-01-chief", "What hurts?", ["tooth", "pain"]), step("c04-short-02-location", "Where?", ["left", "lower"]), step("c04-short-03-duration", "How long has the returned pain been worsening?", ["five", "5", "day"]), step("c04-short-04-severity", "Pain out of ten?", ["7", "seven"]), step("c04-short-05-infection", "Any swelling, pus, fever, or chills?", ["no", "swelling", "pus", "fever"]), step("c04-short-06-allergy", "Penicillin allergy and reaction?", ["penicillin", "hives"]),
  ]),
  scenario(case04.id, case04.patient, "compound-imperfect", case04.contract, [
    step("c04-imperfect-01", "where does tooth hurt?", ["left", "lower"]), step("c04-imperfect-02-duration", "how long has returned pain been worsening?", ["five", "5", "day"]), step("c04-imperfect-03", "constant how bad and biting?", ["constant", "7", "bite"]), step("c04-imperfect-04", "cold before and cold now?", ["before", "no", "now"]), step("c04-imperfect-05", "swelling pus fever swallow breathe?", ["no", "swelling", "drain", "fever"]), step("c04-imperfect-06", "allergy reaction meds and insurance?", ["penicillin", "hives", "ibuprofen", "insurance"]),
  ]),
  scenario(case04.id, case04.patient, "treatment-closing", case04.contract, [
    step("c04-plan-01", "The findings suggest a dead tooth nerve with inflammation around the root."), step("c04-plan-02", "You need urgent root-canal treatment or extraction after dental evaluation."), step("c04-plan-03", "Routine antibiotics are not indicated because there are no infection signs."), step("c04-plan-04", "We will account for your penicillin allergy and your wish to save the tooth."), step("c04-plan-05", "Return for swelling, fever, drainage, swallowing, or breathing problems. What concerns do you have?"),
  ]),
  scenario(case05.id, case05.patient, "standard-clinical", case05.contract, [
    step("c05-standard-01-chief", "Hello Sofia, what is bothering you most?", ["pain", "tooth", "night"]), step("c05-standard-02-location-duration", "Where is the pain and how long has it been worsening?", ["left", "lower", "four", "4", "day"]), step("c05-standard-03-character", "Is it constant or spontaneous, what does it feel like, and how bad is it out of ten?", ["constant", "spontaneous", "throbbing", "9", "nine"]), step("c05-standard-04-cold", "Does cold worsen it, and does the pain stop immediately after the cold is removed?", ["cold", "linger", "doesn't", "does not"]), step("c05-standard-05-associated", "Any swelling, drainage, fever, trouble swallowing, or trouble breathing?", ["no", "swelling", "drain", "fever"]), step("c05-standard-06-history", "What pain medicine have you taken, and do you have drug allergies?", ["ibuprofen", "400", "allerg"]), step("c05-standard-07-plan", "This needs urgent definitive dental care rather than antibiotics, ideally within about 72 hours. Does that make sense?", ["yes", "understand", "okay", "question"]), step("c05-standard-08-safety", "Return for new swelling, fever, drainage, swallowing, breathing, voice, or drooling problems."),
  ]),
  scenario(case05.id, case05.patient, "short-direct", case05.contract, [
    step("c05-short-01-chief", "What hurts?", ["tooth", "pain"]), step("c05-short-02-location", "Where?", ["left", "lower"]), step("c05-short-03-duration", "How long?", ["four", "4", "day"]), step("c05-short-04-severity", "Pain out of ten?", ["9", "nine"]), step("c05-short-05-cold", "Cold worse and does it linger?", ["cold", "linger"]), step("c05-short-06-infection", "Swelling, pus, fever, swallowing, or breathing trouble?", ["no", "swelling", "pus", "fever"]),
  ]),
  scenario(case05.id, case05.patient, "compound-imperfect", case05.contract, [
    step("c05-imperfect-01", "where tooth and how many days?", ["left", "lower", "four", "4"]), step("c05-imperfect-02", "constant spontaneous night and how bad?", ["constant", "spontaneous", "night", "9"]), step("c05-imperfect-03", "cold then stop right away or keeps hurting?", ["cold", "linger", "little while"]), step("c05-imperfect-04", "swelling drainage fever dysphagia dyspnea?", ["no", "swelling", "drain", "fever"]), step("c05-imperfect-05", "meds allergies smoke and last dentist?", ["ibuprofen", "allerg", "smoke", "years"]),
  ]),
  scenario(case05.id, case05.patient, "treatment-closing", case05.contract, [
    step("c05-plan-01", "The symptoms are consistent with severe inflammation inside the tooth."), step("c05-plan-02", "You need urgent root-canal treatment or extraction, and we can discuss your wish to save the tooth."), step("c05-plan-03", "Antibiotics are not indicated because there are no infection signs."), step("c05-plan-04", "We should address your insurance and affordability barriers when arranging care."), step("c05-plan-05", "Return for swelling, fever, drainage, swallowing, breathing, voice, or drooling problems. What concerns do you have?"),
  ]),
];
