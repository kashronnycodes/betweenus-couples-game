import { describe, expect, it } from "vitest";
import { questions } from "../data/questions";
import {
  buildReveal,
  canAdvance,
  filterQuestions,
  isFinalRound,
  lockSubmission,
  mostSurprisingRound,
  normalizeRoomCode,
  predictionScore,
  selectQuestions,
  shuffleQuestions,
  getQuestionsForCategory,
  prepareGameQuestions,
  readLocalQuestionHistory,
  resolveQuestionIds,
  selectUniqueQuestionsForGame,
} from "./gameLogic";
import { QUESTION_CATEGORIES, normalizeQuestionCategory } from "../constants/questionCategories";
import type { WouldYouRatherQuestion } from "../types/game";
import type { RoundSubmission } from "../types/game";
const sub = (
  id: string,
  p: "A" | "B",
  g: "A" | "B",
  locked = true,
): RoundSubmission => ({
  playerId: id,
  roundIndex: 0,
  personalChoice: p,
  partnerPrediction: g,
  locked,
});

describe("stable question categories", () => {
  it("uses unique stable category ids", () => {
    const ids = QUESTION_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("normalizes labels and legacy values", () => {
    expect(normalizeQuestionCategory("Deep Questions")).toBe("deep");
    expect(normalizeQuestionCategory("cute and romantic")).toBe("cute-romantic");
    expect(normalizeQuestionCategory("Future Together")).toBe("future-together");
    expect(normalizeQuestionCategory("not-a-category")).toBe("mixed");
  });

  it("has at least twenty valid questions in every selectable category", () => {
    for (const { id } of QUESTION_CATEGORIES) {
      if (id === "mixed") continue;
      expect(getQuestionsForCategory(questions, id).length, id).toBeGreaterThanOrEqual(20);
    }
    expect(questions.length).toBeGreaterThanOrEqual(120);
  });

  it("loads deep questions and all selectable categories safely", () => {
    expect(getQuestionsForCategory(questions, "deep").length).toBeGreaterThan(0);
    for (const { id } of QUESTION_CATEGORIES) {
      expect(getQuestionsForCategory(questions, id).length, id).toBeGreaterThan(0);
    }
    expect(getQuestionsForCategory(questions, "mixed")).toHaveLength(questions.length);
  });
});

describe("history-aware selection", () => {
  const sample = (id: string, category: WouldYouRatherQuestion["category"] = "food"): WouldYouRatherQuestion => ({
    id,
    category,
    question: `Question ${id}?`,
    optionA: `Option A ${id}`,
    optionB: `Option B ${id}`,
    intensity: "Light",
  });

  it("never duplicates ids and does not mutate the source", () => {
    const original = [...questions];
    const result = selectUniqueQuestionsForGame({ questions, category: "deep", count: 20, seenQuestionIds: [], rng: () => 0.5 });
    expect(new Set(result.map((question) => question.id)).size).toBe(result.length);
    expect(questions).toEqual(original);
  });

  it("uses fallback categories when the selected category is short", () => {
    const pool = [sample("food-1"), sample("deep-1", "deep"), sample("deep-2", "deep")];
    const result = prepareGameQuestions({ questions: pool, category: "food", requestedCount: 3, rng: () => 0.5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questionIds).toHaveLength(3);
      expect(result.usedFallbackCategories).toBe(true);
    }
  });

  it("ranks unseen, seen by one, then seen by both", () => {
    const pool = [sample("unseen"), sample("one"), sample("both")];
    const selected = selectUniqueQuestionsForGame({
      questions: pool,
      category: "food",
      count: 3,
      seenQuestionIds: [],
      histories: [
        { questionId: "one", seenByPlayers: 1 },
        { questionId: "both", seenByPlayers: 2, lastSeenAt: "2026-01-01T00:00:00Z" },
      ],
      rng: () => 0.5,
    });
    expect(selected.map((question) => question.id)).toEqual(["unseen", "one", "both"]);
  });

  it("prefers least recently seen when repeats are required", () => {
    const pool = [sample("recent"), sample("old")];
    const selected = selectUniqueQuestionsForGame({
      questions: pool, category: "food", count: 2, seenQuestionIds: [], rng: () => 0.5,
      histories: [
        { questionId: "recent", seenByPlayers: 2, lastSeenAt: "2026-07-01T00:00:00Z" },
        { questionId: "old", seenByPlayers: 2, lastSeenAt: "2025-01-01T00:00:00Z" },
      ],
    });
    expect(selected.map((question) => question.id)).toEqual(["old", "recent"]);
  });

  it("avoids previous-match questions within the same history tier", () => {
    const pool = [sample("previous"), sample("fresh")];
    const selected = selectUniqueQuestionsForGame({
      questions: pool, category: "food", count: 1, seenQuestionIds: [], previousQuestionIds: ["previous"], rng: () => 0.5,
    });
    expect(selected[0].id).toBe("fresh");
  });
});

describe("question safety", () => {
  it("reports missing question ids without returning undefined", () => {
    const map = new Map(questions.map((question) => [question.id, question]));
    expect(() => resolveQuestionIds(["missing-question"], map)).toThrow("Missing question ids");
  });

  it("does not produce undefined for an empty category pool", () => {
    const result = prepareGameQuestions({ questions: [], category: "deep", requestedCount: 5 });
    expect(result).toMatchObject({ ok: false, reason: "NO_VALID_QUESTIONS" });
  });

  it("clears malformed local history without crashing", () => {
    let removed = false;
    const storage = {
      getItem: () => "{broken",
      removeItem: () => { removed = true; },
    };
    expect(readLocalQuestionHistory(storage)).toEqual([]);
    expect(removed).toBe(true);
  });
});
describe("game logic", () => {
  it("shuffles without duplicates", () => {
    const x = shuffleQuestions(questions);
    expect(new Set(x.map((q) => q.id)).size).toBe(x.length);
  });
  it("filters categories", () =>
    expect(
      filterQuestions(questions, "food").every((q) => q.category === "food"),
    ).toBe(true));
  it("selects unique questions", () =>
    expect(
      new Set(selectQuestions(questions, "mixed", 20).map((q) => q.id)).size,
    ).toBe(20));
  it("scores correct and incorrect predictions", () => {
    expect(predictionScore("A", "A")).toBe(1);
    expect(predictionScore("A", "B")).toBe(0);
  });
  it("both players can score", () =>
    expect(
      Object.values(
        buildReveal(0, sub("a", "A", "B"), sub("b", "B", "A"))!.correct,
      ),
    ).toEqual([true, true]));
  it("normalizes room codes", () =>
    expect(normalizeRoomCode(" o1-ab 2cd!")).toBe("AB2CD"));
  it("detects final round", () => {
    expect(isFinalRound(9, 10)).toBe(true);
    expect(isFinalRound(8, 10)).toBe(false);
  });
  it("prevents locked changes", () =>
    expect(() =>
      lockSubmission(sub("a", "A", "A"), sub("a", "B", "B")),
    ).toThrow());
  it("hides reveal until both lock", () =>
    expect(
      buildReveal(0, sub("a", "A", "A"), sub("b", "B", "A", false)),
    ).toBeNull());
  it("requires host to advance", () => {
    expect(canAdvance(false, [sub("a", "A", "A"), sub("b", "B", "B")])).toBe(
      false,
    );
    expect(canAdvance(true, [sub("a", "A", "A"), sub("b", "B", "B")])).toBe(
      true,
    );
  });
  it("finds most surprising round", () => {
    const a = buildReveal(0, sub("a", "A", "B"), sub("b", "B", "A"))!;
    const b = buildReveal(1, sub("a", "A", "A"), sub("b", "B", "B"))!;
    expect(mostSurprisingRound([a, b])?.roundIndex).toBe(1);
  });
});
