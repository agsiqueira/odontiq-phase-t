export type CanonicalDentalLocation = "upper-left" | "upper-right" | "lower-left" | "lower-right";

export function normalizeDentalLocation(value: string): CanonicalDentalLocation | null {
  const normalized = value.toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  const arch = /\b(?:lower|bottom|mandibular)\b/.test(normalized) ? "lower" : /\b(?:upper|top|maxillary)\b/.test(normalized) ? "upper" : null;
  const side = /\bleft\b/.test(normalized) ? "left" : /\bright\b/.test(normalized) ? "right" : null;
  return arch && side ? `${arch}-${side}` : null;
}
