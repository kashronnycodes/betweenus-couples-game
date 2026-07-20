import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Copy, Menu, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CinematicBackground } from "./components/background/CinematicBackground";
import { Button } from "./components/common/Button";
import { OptionCard } from "./components/game/OptionCard";
import { CharacterSelectionScreen } from "./components/game/CharacterSelectionScreen";
import { PlayerHUD } from "./components/game/PlayerHUD";
import { APP_CAPTION, APP_NAME } from "./constants/app";
import { AVATARS, type AvatarId } from "./constants/avatars";
import { questions } from "./data/questions";
import { normalizeRoomCode, selectQuestions } from "./lib/gameLogic";
import { useRealtimeGame } from "./hooks/useRealtimeGame";
import type {
  Choice,
  GameScreenState,
  QuestionCategory,
  RevealResult,
} from "./types/game";
const cats: QuestionCategory[] = [
  "Mixed",
  "Cute and Romantic",
  "Funny and Random",
  "Dates and Activities",
  "Food",
  "Future Together",
  "Relationship Preferences",
  "Deep Questions",
];
const motionProps = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.995 },
  transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
};
export default function App() {
  const [screen, setScreen] = useState<GameScreenState>({ kind: "landing" });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [count, setCount] = useState(10);
  const [category, setCategory] = useState<QuestionCategory>("Mixed");
  const [round, setRound] = useState(0);
  const [choice, setChoice] = useState<Choice>();
  const [guess, setGuess] = useState<Choice>();
  const [reveals, setReveals] = useState<RevealResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<AvatarId>();
  const [pendingRoomAction, setPendingRoomAction] = useState<"create" | "join" | null>(null);
  const [menu, setMenu] = useState(false);
  const realtime = useRealtimeGame();
  const room = realtime.state?.room;
  const players = realtime.state?.players ?? [];
  const isHost = Boolean(room && realtime.userId === room.host_user_id);
  const partner = players.find((player) => player.user_id !== realtime.userId)?.display_name ?? "";
  const score = players.map((player) => player.score);
  const game = useMemo(() => {
    if (room?.question_ids.length) {
      return room.question_ids
        .map((id) => questions.find((question) => question.id === id))
        .filter((question): question is (typeof questions)[number] => Boolean(question));
    }
    return selectQuestions(questions, category, count);
  }, [category, count, room?.question_ids]);
  const activeRound = room?.current_round ?? round;
  const q = game[activeRound];
  const connected = realtime.connection === "Connected";
  const inRoom = !["landing", "create", "join", "avatar"].includes(screen.kind);
  const showHUD = ["personal", "prediction", "waiting", "reveal", "results"].includes(screen.kind);
  const go = (kind: GameScreenState["kind"]) =>
    setScreen(
      kind === "error"
        ? { kind, message: "Something went wrong." }
        : ({ kind } as GameScreenState),
    );
  useEffect(() => {
    if (!room) return;
    setCode(room.code);
    setCount(room.total_rounds);
    setCategory(room.category);
    setRound(room.current_round);
    if (room.status === "lobby") go("lobby");
    if (room.status === "playing" && ["lobby", "reveal", "results"].includes(screen.kind)) {
      setChoice(undefined);
      setGuess(undefined);
      go("personal");
    }
    if (room.status === "reveal" && screen.kind !== "reveal") {
      void realtime.getReveal().then((result) => {
        if (!result) return;
        setReveals((current) => [
          ...current.filter((item) => item.roundIndex !== result.roundIndex),
          result,
        ]);
        go("reveal");
      });
    }
    if (room.status === "finished") go("results");
  }, [room?.id, room?.status, room?.current_round]);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <CinematicBackground />
      <div className="relative z-10 min-h-[100svh] flex flex-col">
        <header className="h-[76px] md:h-[86px] max-w-[1440px] w-full mx-auto px-5 md:px-10 flex items-center justify-between fade-rise">
          <button className="text-left" onClick={() => go("landing")}>
            <span className="font-serif text-[clamp(1.6rem,2.5vw,2.15rem)] tracking-tight block leading-none">
              {APP_NAME}
            </span>
            <span className="hidden sm:block text-[10px] uppercase tracking-[.18em] text-[var(--foreground-soft)] mt-1">
              {APP_CAPTION}
            </span>
          </button>
          {inRoom ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-2 text-xs text-[var(--foreground-soft)]">
                {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
                {connected ? "Connected" : "Disconnected"}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(code)}
                className="text-xs tracking-[.2em] font-semibold"
              >
                {code}
              </button>
              <button aria-label="Room menu" onClick={() => setMenu(!menu)}>
                <Menu size={20} />
              </button>
              {menu && (
                <button
                  className="absolute right-5 top-16 btn btn-secondary"
                  onClick={() => {
                    realtime.leave();
                    go("landing");
                  }}
                >
                  Leave room
                </button>
              )}
            </div>
          ) : (
            <nav className="hidden sm:flex gap-2">
              <Button variant="quiet" onClick={() => go("create")}>
                Create Game
              </Button>
              <Button variant="quiet" onClick={() => go("join")}>
                Join Game
              </Button>
            </nav>
          )}
        </header>
        <main className="flex-1 flex flex-col justify-center px-4 md:px-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 md:pb-10">
          {showHUD && (
            <div className="hud-stage">
              <PlayerHUD player={players[0]} side="left" completedRounds={activeRound + (room?.status === "reveal" || room?.status === "finished" ? 1 : 0)} />
              <PlayerHUD player={players[1]} side="right" completedRounds={activeRound + (room?.status === "reveal" || room?.status === "finished" ? 1 : 0)} />
            </div>
          )}
          <section className="glass rounded-[28px] md:rounded-[36px] w-full max-w-5xl mx-auto px-5 py-7 md:px-10 md:py-10 lg:px-12 lg:py-11">
            <AnimatePresence mode="wait">
              <motion.div key={screen.kind} {...motionProps}>
                {screen.kind === "landing" && (
                  <Landing
                    create={() => go("create")}
                    join={() => go("join")}
                  />
                )}{" "}
                {screen.kind === "create" && (
                  <Setup
                    title="Create your room"
                    name={name}
                    setName={setName}
                    count={count}
                    setCount={setCount}
                    category={category}
                    setCategory={setCategory}
                    back={() => go("landing")}
                    error={realtime.error}
                    busy={busy}
                    submit={() => {
                      if (!name.trim()) return;
                      setPendingRoomAction("create");
                      setAvatar(undefined);
                      go("avatar");
                    }}
                  />
                )}{" "}
                {screen.kind === "join" && (
                  <Join
                    name={name}
                    setName={setName}
                    code={code}
                    setCode={setCode}
                    back={() => go("landing")}
                    error={realtime.error}
                    busy={busy}
                    submit={() => {
                      if (!name.trim() || code.length !== 6) return;
                      setPendingRoomAction("join");
                      setAvatar(undefined);
                      go("avatar");
                    }}
                  />
                )}{" "}
                {screen.kind === "avatar" && (
                  <CharacterSelectionScreen
                    selected={avatar}
                    onSelect={setAvatar}
                    onBack={() => go(pendingRoomAction === "join" ? "join" : "create")}
                    busy={busy}
                    error={realtime.error}
                    onContinue={() => {
                      if (!avatar || !pendingRoomAction) return;
                      const selectedAvatar = AVATARS.find((item) => item.id === avatar)!;
                      void perform(async () => {
                        if (pendingRoomAction === "create") {
                          const selected = selectQuestions(questions, category, count);
                          await realtime.createRoom(name, category, count, selected.map((question) => question.id), selectedAvatar.id, selectedAvatar.path);
                        } else {
                          await realtime.joinRoom(name, code, selectedAvatar.id, selectedAvatar.path);
                        }
                      });
                    }}
                  />
                )}{" "}
                {screen.kind === "lobby" && (
                  <Lobby
                    name={name || "You"}
                    partner={partner}
                    code={code}
                    count={count}
                    category={category}
                    isHost={isHost}
                    busy={busy}
                    error={realtime.error}
                    start={() => perform(realtime.startGame)}
                  />
                )}{" "}
                {(screen.kind === "personal" ||
                  screen.kind === "prediction") && (
                  <Question
                    q={q}
                    round={activeRound}
                    count={count}
                    mode={screen.kind}
                    selected={screen.kind === "personal" ? choice : guess}
                    setSelected={
                      screen.kind === "personal" ? setChoice : setGuess
                    }
                    busy={busy}
                    submit={() => {
                      if (screen.kind === "personal") {
                        go("prediction");
                        return;
                      }
                      if (!choice || !guess) return;
                      void perform(async () => {
                        await realtime.submitAnswer(activeRound, choice, guess);
                        go("waiting");
                      });
                    }}
                  />
                )}{" "}
                {screen.kind === "waiting" && (
                  <Waiting round={activeRound} partner={partner} />
                )}{" "}
                {screen.kind === "reveal" && (
                  <Reveal
                    result={reveals.at(-1)!}
                    q={q}
                    names={[
                      players[0]?.display_name ?? (name || "You"),
                      players[1]?.display_name ?? partner,
                    ]}
                    score={score}
                    next={() => perform(realtime.advanceRound)}
                    final={activeRound === count - 1}
                    isHost={isHost}
                    busy={busy}
                  />
                )}{" "}
                {screen.kind === "results" && (
                  <Results
                    names={[
                      players[0]?.display_name ?? (name || "You"),
                      players[1]?.display_name ?? partner,
                    ]}
                    score={score}
                    total={count}
                    reveals={reveals}
                    again={() => {
                      setRound(0);
                      setReveals([]);
                      realtime.leave();
                      go("create");
                    }}
                    leave={() => {
                      realtime.leave();
                      go("landing");
                    }}
                  />
                )}{" "}
                {screen.kind === "error" && (
                  <div>
                    <h1 className="question">A small interruption.</h1>
                    <p className="mt-4 text-[var(--foreground-soft)]">
                      {screen.message}
                    </p>
                    <Button onClick={() => go("landing")}>Return home</Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </div>
    </div>
  );
}
function Landing({ create, join }: { create: () => void; join: () => void }) {
  return (
    <div className="text-center max-w-3xl mx-auto py-5 md:py-10">
      <p className="eyebrow fade-rise">For two players</p>
      <h1 className="question mt-5 fade-rise-delay">
        How well do you know each other?
      </h1>
      <p className="text-[var(--foreground-soft)] text-base md:text-lg max-w-xl mx-auto mt-6 leading-relaxed fade-rise-delay-2">
        Choose your answer, predict your partner’s choice, and discover the
        little ways you understand one another.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
        <Button onClick={create}>Create a Game</Button>
        <Button variant="secondary" onClick={join}>
          Join a Game
        </Button>
      </div>
      <p className="text-xs text-[var(--foreground-faint)] mt-6">
        Play together on two separate devices.
      </p>
    </div>
  );
}
function Setup(p: {
  title: string;
  name: string;
  setName: (v: string) => void;
  count: number;
  setCount: (n: number) => void;
  category: QuestionCategory;
  setCategory: (c: QuestionCategory) => void;
  back: () => void;
  submit: () => void;
  error: string;
  busy: boolean;
}) {
  return (
    <form
      className="max-w-xl mx-auto pt-14 md:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        p.submit();
      }}
    >
      <button
        className="glass-back-button"
        type="button"
        onClick={p.back}
        aria-label="Back to home"
        title="Back to home"
      >
        <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <p className="eyebrow">A new game</p>
      <h1 className="font-serif text-[var(--text-title)] mt-2">{p.title}</h1>
      <label className="block mt-7 text-sm">
        Display name
        <input
          className="field mt-2"
          value={p.name}
          maxLength={24}
          onChange={(e) => p.setName(e.target.value)}
          placeholder="What should your partner call you?"
          required
        />
      </label>
      <fieldset className="mt-6">
        <legend className="text-sm mb-2">Number of questions</legend>
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((n) => (
            <button
              type="button"
              className={`btn ${p.count === n ? "btn-primary" : "btn-secondary"}`}
              onClick={() => p.setCount(n)}
              key={n}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block mt-6 text-sm">
        Question category
        <select
          className="field mt-2"
          value={p.category}
          onChange={(e) => p.setCategory(e.target.value as QuestionCategory)}
        >
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <Button className="w-full mt-8" type="submit">
        {p.busy ? "Creating Room…" : "Create Room"}
      </Button>
      {p.error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{p.error}</p>}
    </form>
  );
}
function Join(p: {
  name: string;
  setName: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  back: () => void;
  submit: () => void;
  error: string;
  busy: boolean;
}) {
  return (
    <form
      className="max-w-xl mx-auto pt-14 md:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        p.submit();
      }}
    >
      <button
        className="glass-back-button"
        type="button"
        onClick={p.back}
        aria-label="Back to home"
        title="Back to home"
      >
        <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <p className="eyebrow">Enter their room</p>
      <h1 className="font-serif text-[var(--text-title)] mt-2">
        Join your partner
      </h1>
      <label className="block mt-7 text-sm">
        Display name
        <input
          className="field mt-2"
          value={p.name}
          onChange={(e) => p.setName(e.target.value)}
          required
        />
      </label>
      <label className="block mt-5 text-sm">
        Six-character room code
        <input
          className="field mt-2 text-center tracking-[.35em] uppercase text-lg"
          value={p.code}
          onChange={(e) => p.setCode(normalizeRoomCode(e.target.value))}
          minLength={6}
          required
        />
      </label>
      <Button className="w-full mt-8" type="submit">
        {p.busy ? "Joining…" : "Join Game"}
      </Button>
      {p.error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{p.error}</p>}
    </form>
  );
}
function Lobby({
  name,
  partner,
  code,
  count,
  category,
  start,
  isHost,
  busy,
  error,
}: {
  name: string;
  partner: string;
  code: string;
  count: number;
  category: string;
  start: () => void;
  isHost: boolean;
  busy: boolean;
  error: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <p className="eyebrow">Your room is ready.</p>
      <div className="border-y border-[var(--border)] mt-7 text-left">
        <div className="flex justify-between py-4">
          <span>{name}</span>
          <span className="eyebrow">Ready</span>
        </div>
        {partner && (
          <div className="flex justify-between py-4 border-t border-[var(--border)] reveal-answer">
            <span>{partner}</span>
            <span className="eyebrow text-[var(--success)]">Joined</span>
          </div>
        )}
      </div>

      {!partner && (
        <div className="py-7" aria-live="polite">
          <p className="font-serif text-2xl">Waiting for your partner</p>
          <span className="waiting-dots" aria-hidden="true">
            <i>.</i><i>.</i><i>.</i>
          </span>
        </div>
      )}

      <div className="rounded-[22px] border border-[var(--border)] bg-white/30 px-4 py-5">
        <p className="eyebrow">Join code</p>
        <p className="font-sans text-[clamp(2.3rem,8vw,4.5rem)] tracking-[.16em] font-medium mt-3 leading-none">
          {code}
        </p>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={copyCode}
          aria-label="Copy room code"
        >
          <Copy size={17} aria-hidden="true" />
          {copied ? "Code copied" : "Copy code"}
        </Button>
        <p className="text-sm text-[var(--foreground-soft)] mt-4">
          Send this code to one person. The room closes when they join.
        </p>
      </div>
      <div className="flex justify-center gap-6 text-xs text-[var(--foreground-soft)] mt-5">
        <span>{category}</span>
        <span>{count} rounds</span>
        <span>Connected</span>
      </div>
      {isHost ? (
        <Button className="w-full sm:w-auto mt-8" onClick={start} disabled={!partner || busy}>
          {busy ? "Starting…" : partner ? "Start Game" : "Waiting for partner"}
        </Button>
      ) : (
        <p className="mt-8 text-sm text-[var(--foreground-soft)]">Waiting for the room creator to start.</p>
      )}
      {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </div>
  );
}
function Question({
  q,
  round,
  count,
  mode,
  selected,
  setSelected,
  submit,
  busy,
}: {
  q: (typeof questions)[number];
  round: number;
  count: number;
  mode: "personal" | "prediction";
  selected?: Choice;
  setSelected: (c: Choice) => void;
  submit: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between eyebrow">
        <span>
          Question {String(round + 1).padStart(2, "0")} / {count}
        </span>
        <span>{q.category}</span>
      </div>
      <div className="progress mt-4">
        <i style={{ width: `${((round + 1) / count) * 100}%` }} />
      </div>
      <p className="mt-7 md:mt-9 text-sm font-medium">
        {mode === "personal"
          ? "What would you choose?"
          : "What do you think your partner chose?"}
      </p>
      {mode === "prediction" && (
        <p className="text-sm text-[var(--foreground-soft)] mt-1">
          Answer from their point of view.
        </p>
      )}
      <h1 className="question mt-4 max-w-4xl">{q.question}</h1>
      <div
        role="radiogroup"
        aria-label="Choose an answer"
        className="grid md:grid-cols-2 gap-3 md:gap-5 mt-7"
      >
        <OptionCard
          id="A"
          text={q.optionA}
          selected={selected === "A"}
          onSelect={setSelected}
        />
        <OptionCard
          id="B"
          text={q.optionB}
          selected={selected === "B"}
          onSelect={setSelected}
        />
      </div>
      <div className="flex justify-end mt-6">
        <Button disabled={!selected || busy} onClick={submit}>
          {mode === "personal" ? "Lock In My Answer" : "Lock In My Guess"}
        </Button>
      </div>
    </div>
  );
}
function Waiting({
  round,
  partner,
}: {
  round: number;
  partner: string;
}) {
  return (
    <div className="max-w-xl mx-auto text-center py-8">
      <p className="eyebrow">Round {round + 1}</p>
      <h1 className="question mt-4">Answer locked.</h1>
      <p className="text-[var(--foreground-soft)] mt-5">
        Waiting for {partner} to finish.
      </p>
      <div
        aria-live="polite"
        className="mt-8 border-y border-[var(--border)] text-left"
      >
        <div className="flex justify-between py-4">
          <span>You</span>
          <span className="eyebrow text-[var(--success)]">Complete</span>
        </div>
        <div className="flex justify-between py-4 border-t border-[var(--border)]">
          <span>{partner}</span>
          <span className="eyebrow">Thinking…</span>
        </div>
      </div>
      <p className="text-xs text-[var(--foreground-faint)] mt-6">
        Your partner is thinking.
      </p>
    </div>
  );
}
function Reveal({
  result,
  q,
  names,
  score,
  next,
  final,
  isHost,
  busy,
}: {
  result: RevealResult;
  q: (typeof questions)[number];
  names: [string, string];
  score: number[];
  next: () => void;
  final: boolean;
  isHost: boolean;
  busy: boolean;
}) {
  const hits = Object.values(result.correct).filter(Boolean).length;
  const title =
    hits === 2
      ? "Perfect Match"
      : hits === 1
        ? "One of you saw it coming."
        : "A little surprise.";
  const desc =
    hits === 2
      ? "You both knew exactly what the other would choose."
      : hits === 1
        ? "There is still a little mystery between you."
        : "You just discovered something new about each other.";
  return (
    <div className="text-center">
      <p className="eyebrow">The reveal</p>
      <h1 className="font-serif text-[clamp(2.8rem,7vw,5.5rem)] leading-none mt-3">
        {title}
      </h1>
      <p className="text-[var(--foreground-soft)] mt-4">{desc}</p>
      {result.sameChoice && (
        <p className="text-sm mt-2">You chose the same thing.</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3 mt-8 text-left">
        {result.submissions.map((s, i) => (
          <div
            className="reveal-answer border-y border-[var(--border)] py-5"
            key={s.playerId}
            style={{ animationDelay: `${i * 0.2}s` }}
          >
            <p className="eyebrow">{names[i]}</p>
            <p className="text-lg mt-3">
              Chose <b>{s.personalChoice}</b> —{" "}
              {s.personalChoice === "A" ? q.optionA : q.optionB}
            </p>
            <p
              className={`text-sm mt-3 ${result.correct[s.playerId] ? "text-[var(--success)]" : "text-[var(--surprise)]"}`}
            >
              Predicted {s.partnerPrediction} ·{" "}
              {result.correct[s.playerId] ? "Correct ✓" : "Surprise"}
            </p>
          </div>
        ))}
      </div>
      <p className="font-serif text-3xl mt-7 score-pop">
        Score {score[0]} — {score[1]}
      </p>
      {isHost ? (
        <Button className="mt-6" onClick={next} disabled={busy}>
          {busy ? "Continuing…" : final ? "See Our Results" : "Next Question"}
        </Button>
      ) : (
        <p className="mt-6 text-sm text-[var(--foreground-soft)]">
          Waiting for the room creator to continue.
        </p>
      )}
    </div>
  );
}
function Results({
  names,
  score,
  total,
  reveals,
  again,
  leave,
}: {
  names: [string, string];
  score: number[];
  total: number;
  reveals: RevealResult[];
  again: () => void;
  leave: () => void;
}) {
  const same = reveals.filter((r) => r.sameChoice).length,
    both = reveals.filter((r) =>
      Object.values(r.correct).every(Boolean),
    ).length;
  return (
    <div className="text-center max-w-3xl mx-auto">
      <p className="eyebrow">Between you</p>
      <h1 className="question mt-4">You know each other beautifully.</h1>
      <p className="text-[var(--foreground-soft)] mt-5">
        You understood each other in {score[0] + score[1]} of {total * 2}{" "}
        possible predictions.
      </p>
      <div className="grid grid-cols-2 gap-4 mt-8">
        <div>
          <span className="font-serif text-6xl">{score[0]}</span>
          <p className="eyebrow mt-2">{names[0]}</p>
        </div>
        <div>
          <span className="font-serif text-6xl">{score[1]}</span>
          <p className="eyebrow mt-2">{names[1]}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-9 text-left">
        <Insight n={same} t="Same choices" />
        <Insight n={both} t="Perfect reads" />
        <Insight n={total - both} t="Little surprises" />
      </div>
      <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
        <Button onClick={again}>Play Again</Button>
        <Button variant="secondary" onClick={leave}>
          Leave Game
        </Button>
      </div>
    </div>
  );
}
function Insight({ n, t }: { n: number; t: string }) {
  return (
    <div className="border-t border-[var(--border)] pt-4">
      <span className="font-serif text-3xl">{n}</span>
      <p className="text-sm text-[var(--foreground-soft)]">{t}</p>
    </div>
  );
}
