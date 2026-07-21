import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const categories = [
  "mixed", "cute-romantic", "funny-random", "dates-activities",
  "food", "future-together", "relationship-preferences", "deep",
];
const makeClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const host = makeClient();
const guest = makeClient();

for (const client of [host, guest]) {
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
}

for (const category of categories) {
  const count = category === "deep" ? 20 : 5;
  const { data: created, error: createError } = await host.rpc("create_game_room", {
    p_display_name: "Verifier Host",
    p_category: category,
    p_total_rounds: count,
    p_question_ids: [],
    p_avatar_type: "male",
    p_avatar_path: "/avatars/male.png",
  });
  if (createError) throw createError;
  const { error: joinError } = await guest.rpc("join_game_room", {
    p_display_name: "Verifier Guest",
    p_code: created.room.code,
    p_avatar_type: "female",
    p_avatar_path: "/avatars/female.png",
  });
  if (joinError) throw joinError;
  const ids = Array.from({ length: count }, (_, index) => `verify-${category}-${index + 1}`);
  const { error: startError } = await host.rpc("start_game", {
    p_room: created.room.id,
    p_question_ids: ids,
  });
  if (startError) throw startError;
  const { data: state, error: stateError } = await guest.rpc("get_room_state", { p_room: created.room.id });
  if (stateError) throw stateError;
  if (state.room.status !== "playing" || state.room.question_ids.length !== count) {
    throw new Error(`Invalid synchronized state for ${category}`);
  }
  if (category === "deep") {
    const initialPlayers = state.players.map((player) => player.round_status);
    if (initialPlayers.some((status) => status !== "thinking")) throw new Error("Round did not begin in thinking state");
    const realtimeStatuses = [];
    const statusChannel = guest
      .channel(`verify-status-${created.room.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "players", filter: `room_id=eq.${created.room.id}`,
      }, (payload) => realtimeStatuses.push(payload.new.round_status));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 5000);
      statusChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(status)); }
      });
    });
    for (const [index, [client, personal, prediction]] of [[host, "A", "B"], [guest, "B", "A"]].entries()) {
      const { error } = await client.rpc("submit_round_answer", {
        p_room: created.room.id,
        p_round: state.room.current_round,
        p_personal: personal,
        p_prediction: prediction,
      });
      if (error) throw error;
      const observer = index === 0 ? guest : host;
      const progress = await observer.rpc("get_room_state", { p_room: created.room.id });
      if (progress.error) throw progress.error;
      const statuses = progress.data.players.map((player) => player.round_status);
      const expected = index === 0 ? ["submitted", "thinking"] : ["submitted", "submitted"];
      if (statuses.join() !== expected.join()) throw new Error(`Unexpected realtime progress: ${statuses.join()}`);
    }
    const firstRecord = await host.rpc("record_completed_question", {
      p_room: created.room.id, p_round: state.room.current_round,
    });
    const duplicateRecord = await host.rpc("record_completed_question", {
      p_room: created.room.id, p_round: state.room.current_round,
    });
    const guestRecord = await guest.rpc("record_completed_question", {
      p_room: created.room.id, p_round: state.room.current_round,
    });
    if (firstRecord.error || duplicateRecord.error || guestRecord.error) {
      throw firstRecord.error ?? duplicateRecord.error ?? guestRecord.error;
    }
    if (firstRecord.data !== true || duplicateRecord.data !== false || guestRecord.data !== true) {
      throw new Error("Completed-question history was not idempotent");
    }
    const history = await host.rpc("get_room_question_history", { p_room: created.room.id });
    if (history.error) throw history.error;
    const completed = history.data.find((item) => item.question_id === ids[0]);
    if (completed?.seen_by_players !== 2) throw new Error("Partner history was not combined");
    const advanced = await host.rpc("advance_game_round", { p_room: created.room.id });
    if (advanced.error) throw advanced.error;
    const nextRound = await guest.rpc("get_room_state", { p_room: created.room.id });
    if (nextRound.error) throw nextRound.error;
    if (nextRound.data.players.some((player) => player.round_status !== "thinking")) {
      throw new Error("Player progress did not reset for the next round");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (realtimeStatuses.filter((status) => status === "submitted").length < 2 || !realtimeStatuses.includes("thinking")) {
      throw new Error(`Missing realtime status events: ${realtimeStatuses.join()}`);
    }
    await guest.removeChannel(statusChannel);
  }
  console.log(`verified ${category}: ${count} synchronized questions`);
}

await Promise.all([host.removeAllChannels(), guest.removeAllChannels()]);
console.log("two-player verification passed");
