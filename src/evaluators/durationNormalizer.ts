const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

export function normalizeDurationToDays(value: string): number | null {
  const normalized = value.toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:a couple of|couple of)\s+days?\b/.test(normalized)) return 2;
  if (/\b(?:a|one)\s+week\b/.test(normalized)) return 7;

  const match = normalized.match(/\b(one|two|three|four|five|six|seven|\d+)\s+(days?|weeks?|months?)\b/);
  if (!match) return null;
  const amount = NUMBER_WORDS[match[1]] ?? Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2].startsWith("week")) return amount * 7;
  if (match[2].startsWith("month")) return amount * 30;
  return amount;
}
