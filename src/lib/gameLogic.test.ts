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
} from "./gameLogic";
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
describe("game logic", () => {
  it("shuffles without duplicates", () => {
    const x = shuffleQuestions(questions);
    expect(new Set(x.map((q) => q.id)).size).toBe(x.length);
  });
  it("filters categories", () =>
    expect(
      filterQuestions(questions, "Food").every((q) => q.category === "Food"),
    ).toBe(true));
  it("selects unique questions", () =>
    expect(
      new Set(selectQuestions(questions, "Mixed", 20).map((q) => q.id)).size,
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
