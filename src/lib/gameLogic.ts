import type {
  Choice,
  QuestionCategory,
  RevealResult,
  RoundSubmission,
  WouldYouRatherQuestion,
} from "../types/game";
import { isQuestionCategoryId, normalizeQuestionCategory } from "../constants/questionCategories";

export interface QuestionHistorySummary {
  questionId: string;
  seenByPlayers: 0 | 1 | 2;
  lastSeenAt?: string;
}

export interface LocalQuestionHistoryEntry {
  questionId: string;
  timesSeen: number;
  lastSeenAt: string;
}

export const LOCAL_QUESTION_HISTORY_KEY = "between-us-seen-question-ids";

export function isValidQuestion(value: unknown): value is WouldYouRatherQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<WouldYouRatherQuestion>;
  return typeof q.id === "string" && q.id.trim().length > 0
    && typeof q.question === "string" && q.question.trim().length > 0
    && typeof q.optionA === "string" && q.optionA.trim().length > 0
    && typeof q.optionB === "string" && q.optionB.trim().length > 0
    && isQuestionCategoryId(q.category) && String(q.category) !== "mixed"
    && ["Light", "Meaningful", "Deep"].includes(String(q.intensity));
}

export function validateQuestionLibrary(values: readonly unknown[]) {
  const ids = new Set<string>();
  const valid: WouldYouRatherQuestion[] = [];
  for (const value of values) {
    if (!isValidQuestion(value)) {
      if (import.meta.env.DEV) console.error("[Between Us] Malformed question ignored", value);
      continue;
    }
    if (ids.has(value.id)) {
      if (import.meta.env.DEV) console.error(`[Between Us] Duplicate question id ignored: ${value.id}`);
      continue;
    }
    ids.add(value.id);
    valid.push({ ...value });
  }
  return valid;
}

export function getQuestionsForCategory(
  qs: readonly WouldYouRatherQuestion[],
  category: QuestionCategory,
) {
  const valid = validateQuestionLibrary(qs);
  return category === "mixed" ? [...valid] : valid.filter((q) => q.category === category);
}

export const filterQuestions = getQuestionsForCategory;

export function shuffleQuestions<T>(items: readonly T[], rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function selectQuestions(
  qs: readonly WouldYouRatherQuestion[],
  category: QuestionCategory,
  count: number,
) {
  return selectUniqueQuestionsForGame({ questions: qs, category, count, seenQuestionIds: [] });
}

function historyRank(question: WouldYouRatherQuestion, histories: ReadonlyMap<string, QuestionHistorySummary>) {
  const history = histories.get(question.id);
  return history?.seenByPlayers ?? 0;
}

function lastSeenTime(question: WouldYouRatherQuestion, histories: ReadonlyMap<string, QuestionHistorySummary>) {
  const value = histories.get(question.id)?.lastSeenAt;
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

export function selectUniqueQuestionsForGame(options: {
  questions: readonly WouldYouRatherQuestion[];
  category: QuestionCategory;
  count: number;
  seenQuestionIds: readonly string[];
  histories?: readonly QuestionHistorySummary[];
  previousQuestionIds?: readonly string[];
  rng?: () => number;
}) {
  const valid = validateQuestionLibrary(options.questions);
  const historyMap = new Map((options.histories ?? []).map((item) => [item.questionId, item]));
  for (const id of options.seenQuestionIds) {
    if (!historyMap.has(id)) historyMap.set(id, { questionId: id, seenByPlayers: 1 });
  }
  const previous = new Set(options.previousQuestionIds ?? []);
  const rng = options.rng ?? Math.random;
  const rank = (pool: WouldYouRatherQuestion[]) => shuffleQuestions(pool, rng).sort((a, b) => {
    const historyDifference = historyRank(a, historyMap) - historyRank(b, historyMap);
    if (historyDifference) return historyDifference;
    const previousDifference = Number(previous.has(a.id)) - Number(previous.has(b.id));
    if (previousDifference) return previousDifference;
    if (historyRank(a, historyMap) === 2) return lastSeenTime(a, historyMap) - lastSeenTime(b, historyMap);
    return 0;
  });
  const primary = options.category === "mixed" ? valid : valid.filter((q) => q.category === options.category);
  const primaryIds = new Set(primary.map((q) => q.id));
  const preferredIntensity = primary[0]?.intensity;
  const fallback = valid.filter((q) => !primaryIds.has(q.id));
  const similar = fallback.filter((q) => q.intensity === preferredIntensity);
  const similarIds = new Set(similar.map((q) => q.id));
  const other = fallback.filter((q) => !similarIds.has(q.id));
  const selected = [...rank(primary), ...rank(similar), ...rank(other)].slice(0, Math.max(0, options.count));
  return selected.filter((q, index, all) => all.findIndex((item) => item.id === q.id) === index);
}

export type PrepareGameQuestionsResult =
  | { ok: true; questionIds: string[]; actualCount: number; usedFallbackCategories: boolean; reusedSeenQuestions: boolean }
  | { ok: false; reason: "NO_VALID_QUESTIONS" | "INVALID_CATEGORY" | "QUESTION_DATA_ERROR"; message: string };

export function prepareGameQuestions(options: {
  questions: readonly WouldYouRatherQuestion[];
  category: string;
  requestedCount: number;
  histories?: readonly QuestionHistorySummary[];
  previousQuestionIds?: readonly string[];
  rng?: () => number;
}): PrepareGameQuestionsResult {
  const category = normalizeQuestionCategory(options.category);
  const valid = validateQuestionLibrary(options.questions);
  if (!valid.length) return { ok: false, reason: "NO_VALID_QUESTIONS", message: "We couldn’t prepare these questions." };
  const selected = selectUniqueQuestionsForGame({
    questions: valid,
    category,
    count: Math.min(options.requestedCount, valid.length),
    seenQuestionIds: [],
    histories: options.histories,
    previousQuestionIds: options.previousQuestionIds,
    rng: options.rng,
  });
  if (!selected.length) return { ok: false, reason: "QUESTION_DATA_ERROR", message: "We couldn’t prepare these questions." };
  const categoryCount = getQuestionsForCategory(valid, category).length;
  const history = new Map((options.histories ?? []).map((item) => [item.questionId, item]));
  const result = {
    ok: true as const,
    questionIds: selected.map((q) => q.id),
    actualCount: selected.length,
    usedFallbackCategories: category !== "mixed" && selected.length > categoryCount,
    reusedSeenQuestions: selected.some((q) => (history.get(q.id)?.seenByPlayers ?? 0) > 0),
  };
  if (import.meta.env.DEV) console.info("[Between Us] Question selection", {
    category, validQuestions: valid.length, requestedRounds: options.requestedCount,
    selectedRounds: result.actualCount, fallbackCategoriesUsed: result.usedFallbackCategories,
    repeatedQuestionsRequired: result.reusedSeenQuestions,
  });
  return result;
}

export class QuestionResolutionError extends Error {
  constructor(readonly missingIds: string[]) {
    super(`Missing question ids: ${missingIds.join(", ")}`);
    this.name = "QuestionResolutionError";
  }
}

export function resolveQuestionIds(ids: readonly string[], questionMap: ReadonlyMap<string, WouldYouRatherQuestion>) {
  const missingIds = ids.filter((id) => !questionMap.has(id));
  if (missingIds.length) throw new QuestionResolutionError(missingIds);
  return ids.map((id) => questionMap.get(id)!);
}

export function readLocalQuestionHistory(storage: Pick<Storage, "getItem" | "removeItem"> = localStorage) {
  const raw = storage.getItem(LOCAL_QUESTION_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("invalid_history");
    return parsed.filter((entry): entry is LocalQuestionHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<LocalQuestionHistoryEntry>;
      return typeof item.questionId === "string" && Number.isInteger(item.timesSeen)
        && Number(item.timesSeen) >= 1 && typeof item.lastSeenAt === "string";
    });
  } catch {
    storage.removeItem(LOCAL_QUESTION_HISTORY_KEY);
    return [];
  }
}

export function recordLocalQuestionCompleted(
  questionId: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage,
) {
  const entries = readLocalQuestionHistory(storage);
  const existing = entries.find((entry) => entry.questionId === questionId);
  const next = existing
    ? entries.map((entry) => entry.questionId === questionId
      ? { ...entry, timesSeen: entry.timesSeen + 1, lastSeenAt: new Date().toISOString() }
      : entry)
    : [...entries, { questionId, timesSeen: 1, lastSeenAt: new Date().toISOString() }];
  storage.setItem(LOCAL_QUESTION_HISTORY_KEY, JSON.stringify(next));
  return next;
}
export const normalizeRoomCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .replace(/[OI01]/g, "")
    .slice(0, 6);
export const generateRoomCode = (rng = Math.random) =>
  Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rng() * 32)],
  ).join("");
export const predictionScore = (prediction: Choice, partnerChoice: Choice) =>
  prediction === partnerChoice ? 1 : 0;
export function buildReveal(
  roundIndex: number,
  a: RoundSubmission,
  b: RoundSubmission,
): RevealResult | null {
  if (!a.locked || !b.locked) return null;
  return {
    roundIndex,
    submissions: [a, b],
    correct: {
      [a.playerId]: a.partnerPrediction === b.personalChoice,
      [b.playerId]: b.partnerPrediction === a.personalChoice,
    },
    sameChoice: a.personalChoice === b.personalChoice,
  };
}
export const isFinalRound = (current: number, total: number) =>
  current >= total - 1;
export const canAdvance = (isHost: boolean, subs: RoundSubmission[]) =>
  isHost && subs.length === 2 && subs.every((s) => s.locked);
export function lockSubmission(
  existing: RoundSubmission | undefined,
  next: RoundSubmission,
) {
  if (existing?.locked) throw new Error("Locked answers cannot be modified.");
  return { ...next, locked: true };
}
export const mostSurprisingRound = (rs: RevealResult[]) =>
  rs.reduce<RevealResult | undefined>(
    (best, r) =>
      !best ||
      Object.values(r.correct).filter(Boolean).length <
        Object.values(best.correct).filter(Boolean).length
        ? r
        : best,
    undefined,
  );
