import type { SemanticDimensionName, SemanticTurnEvaluation } from "../types/testResult.js";

const dimensions: readonly SemanticDimensionName[] = ["patientRoleFidelity", "questionRelevance", "caseConsistency", "naturalPatientDialogue", "artifactFree", "disclosureCompliance", "clinicalSafety"];

export interface SemanticEvaluationInput {
  caseId: string;
  permittedFacts: readonly string[];
  recentConversation: ReadonlyArray<{ role: "Student" | "Patient"; text: string }>;
  studentMessage: string;
  patientResponse: string;
}

export async function evaluateSemantically(input: SemanticEvaluationInput): Promise<SemanticTurnEvaluation | null> {
  const endpoint = process.env.PHASE_T_SEMANTIC_EVALUATOR_URL;
  if (!endpoint) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.PHASE_T_SEMANTIC_EVALUATOR_KEY ? { authorization: `Bearer ${process.env.PHASE_T_SEMANTIC_EVALUATOR_KEY}` } : {}),
      },
      body: JSON.stringify({
        rubric: "Score every dimension 0=fail, 1=concern, or 2=pass. Return only the required JSON object with a concise reason per dimension.",
        dimensions,
        ...input,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Semantic evaluator returned HTTP ${response.status}.`);
    return parseSemanticEvaluation(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSemanticEvaluation(value: unknown): SemanticTurnEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Semantic evaluator did not return an object.");
  const record = value as Record<string, unknown>;
  const parsed = {} as SemanticTurnEvaluation;
  for (const dimension of dimensions) {
    const item = record[dimension];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Semantic evaluator omitted ${dimension}.`);
    const score = (item as Record<string, unknown>).score;
    const reason = (item as Record<string, unknown>).reason;
    if (score !== 0 && score !== 1 && score !== 2) throw new Error(`Semantic evaluator returned an invalid ${dimension} score.`);
    if (typeof reason !== "string" || reason.trim().length === 0) throw new Error(`Semantic evaluator returned an invalid ${dimension} reason.`);
    parsed[dimension] = { score, reason: reason.trim() };
  }
  return parsed;
}
