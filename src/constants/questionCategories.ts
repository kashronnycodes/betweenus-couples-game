export const QUESTION_CATEGORIES = [
  { id: "mixed", label: "Mixed" },
  { id: "cute-romantic", label: "Cute and Romantic" },
  { id: "funny-random", label: "Funny and Random" },
  { id: "dates-activities", label: "Dates and Activities" },
  { id: "food", label: "Food" },
  { id: "future-together", label: "Future Together" },
  { id: "relationship-preferences", label: "Relationship Preferences" },
  { id: "deep", label: "Deep Questions" },
] as const;

export type QuestionCategoryId = (typeof QUESTION_CATEGORIES)[number]["id"];

const aliases = new Map<string, QuestionCategoryId>(
  QUESTION_CATEGORIES.flatMap(({ id, label }) => [
    [id, id] as const,
    [label.toLowerCase(), id] as const,
  ]),
);

aliases.set("deep questions", "deep");
aliases.set("cute and romantic", "cute-romantic");
aliases.set("funny and random", "funny-random");
aliases.set("dates and activities", "dates-activities");
aliases.set("future together", "future-together");
aliases.set("relationship preferences", "relationship-preferences");

export function isQuestionCategoryId(value: unknown): value is QuestionCategoryId {
  return typeof value === "string" && QUESTION_CATEGORIES.some(({ id }) => id === value);
}

export function normalizeQuestionCategory(value: string): QuestionCategoryId {
  const normalized = value.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  const category = aliases.get(normalized) ?? aliases.get(normalized.replace(/\s+/g, "-"));
  if (category) return category;
  if (import.meta.env.DEV) console.warn(`[Between Us] Unknown question category "${value}"; using mixed.`);
  return "mixed";
}

export function getQuestionCategoryLabel(id: QuestionCategoryId) {
  return QUESTION_CATEGORIES.find((category) => category.id === id)?.label ?? "Mixed";
}
