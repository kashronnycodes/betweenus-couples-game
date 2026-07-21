import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAnonymousSession, supabase } from "../lib/supabase";
import { questions } from "../data/questions";
import { normalizeQuestionCategory } from "../constants/questionCategories";
import { prepareGameQuestions, readLocalQuestionHistory, recordLocalQuestionCompleted, type QuestionHistorySummary } from "../lib/gameLogic";
import type {
  Choice,
  ConnectionStatus,
  GameStatus,
  QuestionCategory,
  RevealResult,
  RoundSubmission,
  PlayerRoundStatus,
} from "../types/game";

interface SyncedRoom {
  id: string;
  code: string;
  host_user_id: string;
  status: GameStatus;
  category: QuestionCategory;
  total_rounds: number;
  current_round: number;
  question_ids: string[];
  submitted_count: number;
}

interface SyncedPlayer {
  id: string;
  user_id: string;
  display_name: string;
  player_number: 1 | 2;
  score: number;
  connected: boolean;
  avatar_type: string;
  avatar_path: string;
  round_status: PlayerRoundStatus;
}

interface RoomState {
  room: SyncedRoom;
  players: SyncedPlayer[];
}

const SESSION_KEY = "between-us-active-room";

function friendlyError(message?: string) {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("not_configured")) return "The game service is not configured yet.";
  if (message.includes("room_not_found")) return "That room could not be found.";
  if (message.includes("room_full")) return "That room already has two players.";
  if (message.includes("room_expired")) return "That room has expired.";
  if (message.includes("already_started")) return "That game has already started.";
  if (message.includes("host_only")) return "Only the room creator can do that.";
  if (message.includes("not_ready")) return "Your partner is not ready yet.";
  if (message.includes("already_locked")) return "Your answer is already locked.";
  return "The room could not be updated. Please try again.";
}

export function useRealtimeGame() {
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] =
    useState<ConnectionStatus>("Connecting");
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [submissionRetrying, setSubmissionRetrying] = useState(false);
  const roomIdRef = useRef<string | null>(null);

  const refresh = useCallback(async (roomId?: string) => {
    const id = roomId ?? roomIdRef.current;
    if (!supabase || !id) return null;
    const { data, error: rpcError } = await supabase.rpc("get_room_state", {
      p_room: id,
    });
    if (rpcError) throw rpcError;
    const next = data as RoomState;
    next.room.category = normalizeQuestionCategory(String(next.room.category));
    next.room.question_ids = Array.isArray(next.room.question_ids) ? next.room.question_ids : [];
    roomIdRef.current = next.room.id;
    setState(next);
    setConnection("Connected");
    return next;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setConnection("Disconnected");
      setError("Supabase is not configured for this deployment.");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const session = await ensureAnonymousSession();
        if (session) setUserId(session.user.id);
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved && active) await refresh(saved);
        else if (active) setConnection("Connected");
      } catch {
        if (active) {
          setConnection("Disconnected");
          setError("Could not connect to the game service.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !state?.room.id) return;
    const client = supabase;
    const roomId = state.room.id;
    roomIdRef.current = roomId;
    const reload = () => {
      void refresh(roomId).catch(() => setConnection("Reconnecting"));
    };
    const channel = client
      .channel(`between-us:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        reload,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("Connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConnection("Reconnecting");
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [refresh, state?.room.id]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setError("");
    try {
      const session = await ensureAnonymousSession();
      if (session) setUserId(session.user.id);
      return await operation();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const friendly = friendlyError(message);
      setError(friendly);
      throw new Error(friendly);
    }
  }, []);

  const createRoom = useCallback(
    (displayName: string, category: QuestionCategory, totalRounds: number, avatarType: string, avatarPath: string) =>
      run(async () => {
        if (!supabase) throw new Error("not_configured");
        const { data, error: rpcError } = await supabase.rpc("create_game_room", {
          p_display_name: displayName.trim(),
          p_category: category,
          p_total_rounds: totalRounds,
          p_question_ids: [],
          p_avatar_type: avatarType,
          p_avatar_path: avatarPath,
        });
        if (rpcError) throw rpcError;
        const next = data as RoomState;
        next.room.category = normalizeQuestionCategory(String(next.room.category));
        localStorage.setItem(SESSION_KEY, next.room.id);
        roomIdRef.current = next.room.id;
        setState(next);
        return next;
      }),
    [run],
  );

  const joinRoom = useCallback(
    (displayName: string, code: string, avatarType: string, avatarPath: string) =>
      run(async () => {
        if (!supabase) throw new Error("not_configured");
        const { data, error: rpcError } = await supabase.rpc("join_game_room", {
          p_display_name: displayName.trim(),
          p_code: code,
          p_avatar_type: avatarType,
          p_avatar_path: avatarPath,
        });
        if (rpcError) throw rpcError;
        const next = data as RoomState;
        next.room.category = normalizeQuestionCategory(String(next.room.category));
        localStorage.setItem(SESSION_KEY, next.room.id);
        roomIdRef.current = next.room.id;
        setState(next);
        return next;
      }),
    [run],
  );

  const callRoomRpc = useCallback(
    (name: "advance_game_round") =>
      run(async () => {
        if (!supabase || !roomIdRef.current) throw new Error("room_not_found");
        const { error: rpcError } = await supabase.rpc(name, {
          p_room: roomIdRef.current,
        });
        if (rpcError) throw rpcError;
        return refresh();
      }),
    [refresh, run],
  );

  const startGame = useCallback(() => run(async () => {
    if (!supabase || !roomIdRef.current || !state) throw new Error("room_not_found");
    const { data: historyData, error: historyError } = await supabase.rpc("get_room_question_history", {
      p_room: roomIdRef.current,
    });
    if (historyError) throw historyError;
    const serverHistory = (historyData ?? []) as Array<{
      question_id: string;
      seen_by_players: number;
      last_seen_at: string | null;
    }>;
    const histories: QuestionHistorySummary[] = serverHistory.map((item) => ({
      questionId: item.question_id,
      seenByPlayers: Math.min(2, Math.max(0, item.seen_by_players)) as 0 | 1 | 2,
      lastSeenAt: item.last_seen_at ?? undefined,
    }));
    for (const local of readLocalQuestionHistory()) {
      if (!histories.some((item) => item.questionId === local.questionId)) {
        histories.push({ questionId: local.questionId, seenByPlayers: 1, lastSeenAt: local.lastSeenAt });
      }
    }
    const prepared = prepareGameQuestions({
      questions,
      category: state.room.category,
      requestedCount: state.room.total_rounds,
      histories,
      previousQuestionIds: state.room.question_ids,
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    const { error: rpcError } = await supabase.rpc("start_game", {
      p_room: roomIdRef.current,
      p_question_ids: prepared.questionIds,
    });
    if (rpcError) throw rpcError;
    return refresh();
  }), [refresh, run, state]);

  const submitAnswer = useCallback(
    (round: number, personal: Choice, prediction: Choice) =>
      run(async () => {
        if (!supabase || !roomIdRef.current) throw new Error("room_not_found");
        const client = supabase;
        const submit = () => client.rpc("submit_round_answer", {
          p_room: roomIdRef.current!, p_round: round, p_personal: personal, p_prediction: prediction,
        });
        let result = await submit();
        if (result.error) {
          setSubmissionRetrying(true);
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          result = await submit();
        }
        setSubmissionRetrying(false);
        if (result.error && !result.error.message.includes("already_locked")) throw result.error;
        return refresh();
      }),
    [refresh, run],
  );

  const getReveal = useCallback(async (): Promise<RevealResult | null> => {
    if (!supabase || !state) return null;
    const { data, error: rpcError } = await supabase.rpc("get_round_reveal", {
      p_room: state.room.id,
      p_round: state.room.current_round,
    });
    if (rpcError) throw rpcError;
    const rows = data as Array<{
      player_id: string;
      player_number: 1 | 2;
      personal_choice: Choice;
      partner_prediction: Choice;
    }>;
    if (rows.length !== 2) return null;
    const questionId = state.room.question_ids[state.room.current_round];
    if (questionId) {
      const { data: wasRecorded, error: historyError } = await supabase.rpc("record_completed_question", {
        p_room: state.room.id,
        p_round: state.room.current_round,
      });
      if (!historyError && wasRecorded === true) recordLocalQuestionCompleted(questionId);
    }
    rows.sort((a, b) => a.player_number - b.player_number);
    const submissions = rows.map(
      (row): RoundSubmission => ({
        playerId: row.player_id,
        roundIndex: state.room.current_round,
        personalChoice: row.personal_choice,
        partnerPrediction: row.partner_prediction,
        locked: true,
      }),
    ) as [RoundSubmission, RoundSubmission];
    return {
      roundIndex: state.room.current_round,
      submissions,
      correct: {
        [submissions[0].playerId]:
          submissions[0].partnerPrediction === submissions[1].personalChoice,
        [submissions[1].playerId]:
          submissions[1].partnerPrediction === submissions[0].personalChoice,
      },
      sameChoice: submissions[0].personalChoice === submissions[1].personalChoice,
    };
  }, [state]);

  const leave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    roomIdRef.current = null;
    setState(null);
    setError("");
  }, []);

  return {
    state,
    userId,
    connection,
    error,
    submissionRetrying,
    clearError: () => setError(""),
    createRoom,
    joinRoom,
    startGame,
    submitAnswer,
    getReveal,
    advanceRound: () => callRoomRpc("advance_game_round"),
    refresh,
    leave,
  };
}
