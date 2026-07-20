import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAnonymousSession, supabase } from "../lib/supabase";
import type {
  Choice,
  ConnectionStatus,
  GameStatus,
  QuestionCategory,
  RevealResult,
  RoundSubmission,
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
  const roomIdRef = useRef<string | null>(null);

  const refresh = useCallback(async (roomId?: string) => {
    const id = roomId ?? roomIdRef.current;
    if (!supabase || !id) return null;
    const { data, error: rpcError } = await supabase.rpc("get_room_state", {
      p_room: id,
    });
    if (rpcError) throw rpcError;
    const next = data as RoomState;
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
    const poll = window.setInterval(reload, 2500);
    return () => {
      window.clearInterval(poll);
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
    (displayName: string, category: QuestionCategory, totalRounds: number, questionIds: string[], avatarType: string, avatarPath: string) =>
      run(async () => {
        if (!supabase) throw new Error("not_configured");
        const { data, error: rpcError } = await supabase.rpc("create_game_room", {
          p_display_name: displayName.trim(),
          p_category: category,
          p_total_rounds: totalRounds,
          p_question_ids: questionIds,
          p_avatar_type: avatarType,
          p_avatar_path: avatarPath,
        });
        if (rpcError) throw rpcError;
        const next = data as RoomState;
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
        localStorage.setItem(SESSION_KEY, next.room.id);
        roomIdRef.current = next.room.id;
        setState(next);
        return next;
      }),
    [run],
  );

  const callRoomRpc = useCallback(
    (name: "start_game" | "advance_game_round") =>
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

  const submitAnswer = useCallback(
    (round: number, personal: Choice, prediction: Choice) =>
      run(async () => {
        if (!supabase || !roomIdRef.current) throw new Error("room_not_found");
        const { error: rpcError } = await supabase.rpc("submit_round_answer", {
          p_room: roomIdRef.current,
          p_round: round,
          p_personal: personal,
          p_prediction: prediction,
        });
        if (rpcError) throw rpcError;
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
    clearError: () => setError(""),
    createRoom,
    joinRoom,
    startGame: () => callRoomRpc("start_game"),
    submitAnswer,
    getReveal,
    advanceRound: () => callRoomRpc("advance_game_round"),
    refresh,
    leave,
  };
}
