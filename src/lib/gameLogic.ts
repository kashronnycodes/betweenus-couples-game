import type {
  Choice,
  QuestionCategory,
  RevealResult,
  RoundSubmission,
  WouldYouRatherQuestion,
} from "../types/game";
export const filterQuestions = (
  qs: WouldYouRatherQuestion[],
  c: QuestionCategory,
) => (c === "Mixed" ? qs : qs.filter((q) => q.category === c));
export function shuffleQuestions<T>(items: T[], rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function selectQuestions(
  qs: WouldYouRatherQuestion[],
  category: QuestionCategory,
  count: number,
) {
  const pool = filterQuestions(qs, category);
  if (pool.length < count)
    throw new Error("Not enough questions in this category.");
  return shuffleQuestions(pool).slice(0, count);
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
