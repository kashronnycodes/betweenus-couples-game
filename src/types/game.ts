export type Choice = "A" | "B";
import type { QuestionCategoryId } from "../constants/questionCategories";
export type QuestionCategory = QuestionCategoryId;
export type QuestionIntensity = "Light" | "Meaningful" | "Deep";
export interface WouldYouRatherQuestion {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  category: Exclude<QuestionCategory, "mixed">;
  intensity: QuestionIntensity;
}
export interface Player {
  id: string;
  displayName: string;
  playerNumber: 1 | 2;
  score: number;
  connected: boolean;
  avatarType: string;
  avatarPath: string;
}
export interface RoundSubmission {
  playerId: string;
  roundIndex: number;
  personalChoice: Choice;
  partnerPrediction: Choice;
  locked: boolean;
}
export interface RevealResult {
  roundIndex: number;
  submissions: [RoundSubmission, RoundSubmission];
  correct: Record<string, boolean>;
  sameChoice: boolean;
}
export type ConnectionStatus =
  | "Connecting"
  | "Connected"
  | "Reconnecting"
  | "Disconnected";
export type GameStatus = "lobby" | "playing" | "reveal" | "finished";
export interface GameRoom {
  id: string;
  code: string;
  hostUserId: string;
  status: GameStatus;
  category: QuestionCategory;
  totalRounds: number;
  currentRound: number;
  questionIds: string[];
  players: Player[];
}
export interface PlayerSession {
  userId: string;
  roomId: string;
  playerId: string;
}
export type GameScreenState =
  | { kind: "landing" }
  | { kind: "create" }
  | { kind: "join" }
  | { kind: "avatar" }
  | { kind: "lobby" }
  | { kind: "personal" }
  | { kind: "prediction" }
  | { kind: "waiting" }
  | { kind: "reveal" }
  | { kind: "results" }
  | { kind: "error"; message: string };
