import type { CaseBehaviorContract } from "../types/scenario.js";

export const case01BehaviorContract: CaseBehaviorContract = {
  permittedFacts: ["Amara Johnson", "severe toothache", "jaw/facial swelling", "four-day onset", "pain approximately 8/10", "feverish", "breathing or swallowing difficulty", "type 2 diabetes", "hypertension", "metformin", "lisinopril", "no opioid or narcotic use or misuse history", "no known medication allergies"],
  firstResponseFactLimit: 4,
  stableFacts: [
    { id: "duration", label: "four-day symptom duration", acceptedPatterns: [/four days?/i, /4 days?/i], contradictionPatterns: [/\b(?:pain|ache|swelling|symptoms?|it)\b.{0,30}\b(?:started|began|for|since)\b.{0,15}\b(?:yesterday|weeks?|months?|years?)\b/i] },
    { id: "severity", label: "pain around 8/10", acceptedPatterns: [/\b8\s*(?:\/|out of)\s*10\b/i, /\bsevere\b/i], contradictionPatterns: [/\b(?:[0-4])\s*(?:\/|out of)\s*10\b/i, /\bmild pain\b/i] },
    { id: "swelling", label: "jaw or facial swelling", acceptedPatterns: [/\bswoll(?:en|ing)\b/i], contradictionPatterns: [/\b(?:no|not|haven't had|have not had)\b.{0,25}\bswoll(?:en|ing)\b/i] },
    { id: "medical-history", label: "type 2 diabetes and hypertension", acceptedPatterns: [/\bdiabetes\b/i, /\bhypertension\b/i], contradictionPatterns: [/\b(?:no|don't have|do not have)\b.{0,35}\b(?:diabetes|hypertension|medical conditions?)\b/i] },
    { id: "allergies", label: "no known medication allergies", acceptedPatterns: [/\bno known (?:medication )?allerg/i, /\bnot allergic\b/i, /\b(?:don't|do not) have (?:any )?(?:known )?(?:drug|medication)?\s*allerg/i], contradictionPatterns: [/\b(?:i am|i'm)\s+(?!not\b)allergic to\s+(?:penicillin|amoxicillin|ibuprofen|aspirin)\b/i] },
    { id: "opioid-history", label: "no opioid use or misuse history", acceptedPatterns: [/\b(?:no|not|never|haven't|have not|don't|do not)\b.{0,55}\b(?:opioids?|opiates?|narcotics?|prescription (?:painkillers?|pain (?:medication|medicine|pills?))|misus(?:e|ed)|abus(?:e|ed)|dependen(?:ce|t)|addict(?:ion|ed))\b/i], contradictionPatterns: [/\byes\b.{0,55}\b(?:opioids?|opiates?|narcotics?|misus(?:e|ed)|dependen(?:ce|t))\b/i, /\bi(?:'ve| have| had)\s+(?!not\b|never\b|no\b).{0,45}\b(?:opioids?|opiates?|narcotics?|prescription (?:painkillers?|pain (?:medication|medicine|pills?))|misus(?:e|ed)|dependen(?:ce|t))\b/i, /\bi\s+(?:used|took|misused|abused)\b.{0,35}\b(?:opioids?|opiates?|narcotics?|prescription (?:painkillers?|pain (?:medication|medicine|pills?)))\b/i, /\bi\s+(?:was|am)\s+(?:dependent|addicted)\b.{0,25}\bopioids?\b/i], directQuestionPatterns: [/\b(?:opioids?|opiates?|narcotics?|prescription (?:painkillers?|pain (?:medication|medicine|pills?))|opioid (?:use|misuse|abuse|dependence|addiction))\b/i] },
  ],
};

export const case02BehaviorContract: CaseBehaviorContract = {
  permittedFacts: ["Marcus Lee", "severe upper-right tooth pain", "symptoms have worsened over seven days", "feverish", "weak and generally sick", "increasing right-cheek swelling", "no breathing or swallowing difficulty"],
  firstResponseFactLimit: 4,
  stableFacts: [
    { id: "location", label: "upper-right tooth location", acceptedPatterns: [/upper[- ]right/i], contradictionPatterns: [/\b(?:upper[- ]left|lower[- ]right|lower[- ]left|left side)\b/i] },
    {
      id: "duration",
      label: "approximately seven-day symptom duration",
      canonicalDurationDays: 7,
      acceptedPatterns: [
        /\b(?:seven|7)\s+days?\b/i,
        /\b(?:(?:about|approximately|around|roughly|nearly)\s+)?(?:a|one)\s+week\b/i,
      ],
      contradictionPatterns: [
        /\b(?:started|began|lasted|going on|hurting|worsening|getting worse)\b.{0,30}\b(?:today|yesterday|(?:one|two|three|four|five|six|1|2|3|4|5|6|couple of|few)\s+days?|(?:two|three|four|2|3|4)\s+weeks?|months?|years?)\b/i,
        /\b(?:pain|ache|symptoms?)\b.{0,30}\bfor\b.{0,20}\b(?:one|two|three|four|five|six|1|2|3|4|5|6|couple of|few)\s+days?\b/i,
      ],
    },
    { id: "airway", label: "no breathing or swallowing difficulty", acceptedPatterns: [/\bno\b.{0,45}\b(?:breath|swallow)/i, /haven't had\b.{0,45}\b(?:breath|swallow)/i, /\b(?:can|able to)\b.{0,20}\bbreath(?:e|ing)?\b.{0,20}\b(?:normally|fine|okay|without (?:trouble|difficulty))/i], contradictionPatterns: [/\bi(?:'m| am)\s+(?!not\b)(?:having\s+)?(?:trouble|difficulty|a hard time)\b.{0,20}\b(?:breath|swallow)/i, /\bi(?: have|'ve)\s+(?!no\b|not\b)(?:trouble|difficulty|a hard time)\b.{0,20}\b(?:breath|swallow)/i] },
    { id: "swelling", label: "increasing right-cheek swelling", acceptedPatterns: [/\bright\b.{0,25}\b(?:cheek|face)\b.{0,25}\b(?:swollen|swelling)\b/i, /\b(?:swollen|swelling)\b.{0,25}\bright\b.{0,20}\b(?:cheek|face|side)\b/i, /\bright cheek\b.{0,30}\b(?:more swollen|getting (?:more )?swollen|increas(?:e|ed|ing))/i], contradictionPatterns: [/\b(?:no|not|haven't|have not)\b.{0,25}\b(?:swollen|swelling)\b/i, /\b(?:left|lower[- ]left)\b.{0,25}\b(?:cheek|face|facial)\b.{0,20}\b(?:swollen|swelling)\b/i, /\b(?:swollen|swelling)\b.{0,25}\b(?:left|lower[- ]left)\b/i, /\bswelling\b.{0,20}\b(?:resolved|gone|went away|improved)\b/i] },
  ],
};

export const case03BehaviorContract: CaseBehaviorContract = {
  permittedFacts: ["Elena Garcia", "25-year-old woman", "right mandibular posterior tooth pain", "three-day progression", "constant throbbing 8/10 pain", "pain radiating toward the right ear", "pain with biting and chewing", "mild lower-right facial puffiness", "no fever or airway symptoms", "stomach ulcers", "Pepcid as needed", "ibuprofen intolerance", "no known drug allergies", "crown with uncertain root-canal history", "non-smoker", "dentist appointment next week"],
  firstResponseFactLimit: 4,
  stableFacts: [
    { id: "location", label: "right mandibular posterior location", canonicalLocation: "lower-right", acceptedPatterns: [/\b(?:lower[- ]right|right (?:mandibular|lower))\b/i], contradictionPatterns: [/\b(?:left|upper[- ]right|maxillary)\b.{0,25}\b(?:tooth|molar|jaw)\b/i], directQuestionPatterns: [/\bwhere|which tooth|what side|upper or lower\b/i] },
    { id: "duration", label: "three-day symptom duration", canonicalDurationDays: 3, acceptedPatterns: [/\b(?:three|3)\s+days?\b/i], contradictionPatterns: [/\b(?:started|began|hurting|worsening|going on)\b.{0,30}\b(?:(?:one|two|four|five|six|seven|1|2|4|5|6|7)\s+days?|(?:one|two|three|1|2|3)\s+weeks?|months?|years?)\b/i], directQuestionPatterns: [/\bhow long|when.{0,20}(?:start|begin)|duration\b/i] },
    { id: "severity", label: "8/10 severe pain", acceptedPatterns: [/\b8\s*(?:\/|out of|on (?:a )?(?:pain )?scale of(?: 1 to)?)\s*10\b/i, /\beight (?:out of|on (?:a )?(?:pain )?scale of(?: one to)?) ten\b/i, /^\s*(?:eight|8)[.!]?\s*$/i], contradictionPatterns: [/\b(?:[0-7]|9|10)\s*(?:\/|out of|on (?:a )?(?:pain )?scale of(?: 1 to)?)\s*10\b/i], directQuestionPatterns: [/\bhow bad|severity|pain scale|out of ten\b/i] },
    { id: "swelling", label: "mild lower-right facial puffiness", acceptedPatterns: [/\b(?:puffy|swoll(?:en|ing))\b/i], contradictionPatterns: [/\b(?:no|not|haven't|have not)\b.{0,25}\b(?:puffy|swoll(?:en|ing))\b/i], directQuestionPatterns: [/\bswell|puffy\b/i] },
    { id: "fever", label: "no fever", acceptedPatterns: [/\b(?:no|not|haven't|have not|don't have|do not have)\b.{0,55}\bfever/i], contradictionPatterns: [/\b(?:i(?:'ve| have| am|'m)|feeling)\b.{0,20}\bfever(?:ish)?\b/i], directQuestionPatterns: [/\bfever|temperature|chills\b/i] },
    { id: "ulcers", label: "stomach-ulcer history", acceptedPatterns: [/\bstomach ulcers?\b/i], contradictionPatterns: [/\b(?:no|don't have|do not have)\b.{0,20}\bulcers?\b/i], directQuestionPatterns: [/\bmedical history|conditions|ulcers\b/i] },
    { id: "ibuprofen", label: "poor ibuprofen tolerance", acceptedPatterns: [/\b(?:ibuprofen|advil|motrin)\b.{0,35}\b(?:upsets?|bothers?|poorly tolerate|stomach|avoid)\b/i], contradictionPatterns: [/\b(?:ibuprofen|advil|motrin)\b.{0,25}\b(?:works well|no problem|tolerate well)\b/i], directQuestionPatterns: [/\bibuprofen|advil|motrin\b/i] },
    { id: "allergies", label: "no known drug allergies", acceptedPatterns: [/\bno known (?:drug|medication)?\s*allerg/i, /\b(?:don't|do not) have (?:any )?(?:known )?(?:drug )?allerg/i, /\bnot allergic\b/i], contradictionPatterns: [/\ballergic to\b.{0,20}\b(?:penicillin|amoxicillin|ibuprofen)\b/i], directQuestionPatterns: [/\ballerg/i] },
  ],
};

export const case04BehaviorContract: CaseBehaviorContract = {
  permittedFacts: ["Noah Patel", "38-year-old man", "left mandibular first-molar pain", "five-day returned-pain progression", "prior severe episode stopped then returned", "constant 7/10 pain", "sharp biting and chewing pain", "historical but not current cold pain", "no swelling, drainage, fever, or airway symptoms", "penicillin allergy causing hives", "ibuprofen 400 mg without adequate relief", "otherwise healthy", "one-pack-per-day smoker", "no dental insurance", "wants to save the tooth"],
  firstResponseFactLimit: 4,
  stableFacts: [
    { id: "location", label: "left mandibular first-molar location", canonicalLocation: "lower-left", acceptedPatterns: [/\b(?:lower[- ]left|left (?:mandibular|lower))\b/i], contradictionPatterns: [/\b(?:right|upper[- ]left|maxillary)\b.{0,25}\b(?:tooth|molar|jaw)\b/i], directQuestionPatterns: [/\bwhere|which tooth|what side|upper or lower\b/i] },
    { id: "duration", label: "five-day returned-pain duration", canonicalDurationDays: 5, acceptedPatterns: [/\b(?:five|5)\s+days?\b/i], contradictionPatterns: [/\b(?:returned|worsening|going on|hurting)\b.{0,30}\b(?:(?:one|two|three|four|six|seven|1|2|3|4|6|7)\s+days?|(?:one|two|three|1|2|3)\s+weeks?|months?|years?)\b/i], directQuestionPatterns: [/\bhow long|duration\b/i] },
    { id: "severity", label: "7/10 pain", acceptedPatterns: [/\b7\s*(?:\/|out of|on (?:a )?scale of(?: 1 to)?)\s*10\b/i, /\bseven (?:out of|on (?:a )?scale of(?: one to)?) ten\b/i, /^\s*(?:seven|7)[.!]?\s*$/i], contradictionPatterns: [/\b(?:[0-6]|8|9|10)\s*(?:\/|out of|on (?:a )?scale of(?: 1 to)?)\s*10\b/i], directQuestionPatterns: [/\bhow bad|severity|pain scale|out of ten\b/i] },
    { id: "swelling", label: "no swelling", acceptedPatterns: [/\b(?:no|not|haven't|have not|don't have|do not have)\b.{0,45}\bswell/i], contradictionPatterns: [/\b(?:my|the)\b.{0,20}\bswoll(?:en|ing)\b/i], directQuestionPatterns: [/\bswell/i] },
    { id: "fever", label: "no fever or chills", acceptedPatterns: [/\b(?:no|not|haven't|have not|don't have|do not have)\b.{0,55}\b(?:fever|chills)/i], contradictionPatterns: [/\b(?:i(?:'ve| have| am|'m)|feeling)\b.{0,20}\b(?:feverish|chills)\b/i], directQuestionPatterns: [/\bfever|chills\b/i] },
    { id: "penicillin", label: "penicillin allergy with hives", acceptedPatterns: [/\bpenicillin\b.{0,30}\b(?:allerg|hives)\b/i, /\b(?:allerg|hives)\b.{0,30}\bpenicillin\b/i], contradictionPatterns: [/\b(?:no|not)\b.{0,25}\b(?:penicillin )?allerg/i], directQuestionPatterns: [/\bpenicillin|allerg|reaction\b/i] },
    { id: "cold-current", label: "no current cold sensitivity", acceptedPatterns: [/\bcold\b.{0,80}\b(?:doesn't|does not|no longer|not (?:now|anymore))\b/i, /\b(?:doesn't|does not|no longer|don't feel anything)\b.{0,80}\bcold\b/i], contradictionPatterns: [/\b(?:now|currently)\b.{0,20}\bcold\b.{0,20}\b(?:hurts?|painful|worse)\b/i, /\bcold\b.{0,20}\b(?:still|currently)\b.{0,15}\b(?:hurts?|painful|worse)\b/i], directQuestionPatterns: [/\bcold.{0,20}(?:still|now|current)/i] },
  ],
};

export const case05BehaviorContract: CaseBehaviorContract = {
  permittedFacts: ["Sofia Williams", "32-year-old woman", "lower-left tooth pain", "four-day progression", "constant deep throbbing 9/10 pain", "spontaneous and nocturnal pain", "cold worsens and pain lingers qualitatively", "chewing and slight biting discomfort", "no swelling, drainage, fever, or airway symptoms", "ibuprofen 400 mg without adequate relief", "no known drug allergies", "otherwise healthy", "half-pack-per-day smoker", "five-year dental-care gap", "uninsured affordability barrier", "wants to save the tooth"],
  firstResponseFactLimit: 4,
  stableFacts: [
    { id: "location", label: "lower-left tooth location", canonicalLocation: "lower-left", acceptedPatterns: [/\b(?:lower[- ]left|left (?:mandibular|lower))\b/i], contradictionPatterns: [/\b(?:right|upper[- ]left|maxillary)\b.{0,25}\b(?:tooth|molar|jaw)\b/i], directQuestionPatterns: [/\bwhere|which tooth|what side|upper or lower\b/i] },
    { id: "duration", label: "four-day symptom duration", canonicalDurationDays: 4, acceptedPatterns: [/\b(?:four|4)\s+days?\b/i], contradictionPatterns: [/\b(?:started|began|hurting|worsening|going on)\b.{0,30}\b(?:(?:one|two|three|five|six|seven|1|2|3|5|6|7)\s+days?|(?:one|two|three|1|2|3)\s+weeks?|months?|years?)\b/i], directQuestionPatterns: [/\bhow long|when.{0,20}(?:start|begin)|duration\b/i] },
    { id: "severity", label: "9/10 severe pain", acceptedPatterns: [/\b9\s*(?:\/|out of)\s*10\b/i, /\bnine out of ten\b/i, /^\s*(?:nine|9)[.!]?\s*$/i], contradictionPatterns: [/\b(?:[0-8]|10)\s*(?:\/|out of)\s*10\b/i], directQuestionPatterns: [/\bhow bad|severity|pain scale|out of ten\b/i] },
    { id: "cold", label: "cold-worsened lingering pain", acceptedPatterns: [/\bcold\b.{0,70}\b(?:worse|hurts?|pain|linger(?:s|ed|ing)?|doesn't stop|does not stop)\b/i, /\b(?:pain\b.{0,25})?linger(?:s|ed|ing)?\b.{0,70}\bcold\b/i, /\b(?:doesn't|does not) stop (?:immediately|right away)\b.{0,70}\blinger(?:s|ed|ing)?/i], contradictionPatterns: [/\bcold\b.{0,25}\b(?:relieves?|helps?|calms?|stops immediately)\b/i], directQuestionPatterns: [/\bcold|thermal|stop immediately|linger\b/i] },
    { id: "swelling", label: "no swelling", acceptedPatterns: [/\b(?:no|not|haven't|have not|don't have|do not have)\b.{0,45}\bswell/i], contradictionPatterns: [/\b(?:my|the)\b.{0,20}\bswoll(?:en|ing)\b/i], directQuestionPatterns: [/\bswell/i] },
    { id: "fever", label: "no fever", acceptedPatterns: [/\b(?:no|not|haven't|have not|don't have|do not have)\b.{0,55}\bfever/i], contradictionPatterns: [/\b(?:i(?:'ve| have| am|'m)|feeling)\b.{0,20}\bfever(?:ish)?\b/i], directQuestionPatterns: [/\bfever|temperature|chills\b/i] },
    { id: "allergies", label: "no known drug allergies", acceptedPatterns: [/\bno known (?:drug|medication)?\s*allerg/i, /\b(?:don't|do not) have (?:any )?(?:known )?(?:drug )?allerg/i, /\bnot allergic\b/i], contradictionPatterns: [/\ballergic to\b.{0,20}\b(?:penicillin|amoxicillin|ibuprofen)\b/i], directQuestionPatterns: [/\ballerg/i] },
    { id: "smoking", label: "half-pack-per-day smoking history", acceptedPatterns: [/\b(?:smoke|smoking)\b.{0,35}\b(?:half|0\.5|one[- ]half)\b.{0,20}\bpack\b/i, /\bhalf[- ]?(?:a )?pack\b.{0,30}\b(?:smoke|cigarette)/i], contradictionPatterns: [/\b(?:don't|do not|never|not)\b.{0,20}\bsmok/i, /\bnon[- ]?smoker\b/i], directQuestionPatterns: [/\bsmok|tobacco|cigarette\b/i] },
  ],
};
