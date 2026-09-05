import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Check, Clock, Flag, Heart, Info, Music, Pencil, Sparkles, Target, X } from "lucide-react";
import { answers, type AnswerState, type MainImage } from "../api";
import { useAuth } from "../auth";
import { Button, Card, HeroCard, NudgeButton, Spinner, useSoloHeader } from "../ui";
import { useScreenEntry } from "../router";
import { MessageThread } from "./QuestionExperience";

interface GameOption {
  id: string;
  text: string;
  allowsNote?: boolean;
  maxNoteLength?: number;
}
interface GameQuestion {
  id: string;
  // PartnerKnowledge prompts…
  userPrompt?: string | null;
  partnerPrompt?: string | null;
  commonPrompt?: string | null;
  options?: GameOption[];
  // …vs a bare YouOrMe statement.
  prompt?: string | null;
}
interface GameInner {
  type?: string | null;
  coupleGameType?: string | null;
  goal?: string | null;
  coupleGameGoal?: string | null;
  howItWorks?: string[];
  questionsIntro?: string | null;
  questions?: GameQuestion[];
  mainImage?: MainImage;
}
// The couple-games detail comes back wrapped in a `game` key.
export interface GameData extends GameInner {
  game?: GameInner;
}

// `mineNote`/`guessNote` hold the free-text a "Something else" (allowsNote)
// option lets the user type in.
type Pick = { mine?: string; guess?: string; mineNote?: string; guessNote?: string };
type Responses = Record<string, Pick>;

// Prompts are authored from the reader's perspective with braced tokens. Beyond
// the partner placeholders, the content uses a long tail of second-person forms
// ({You}, {Your}, {you're}, {My}, …) whose inner text is already the right word —
// so anything left over is unwrapped rather than left showing its braces.
const fill = (s: string | null | undefined, you: string, partner: string) =>
  (s || "")
    .replace(/\{My partner's\}/g, `${partner}'s`)
    .replace(/\{(?:partner_name|partner|your partner)\}/g, partner)
    .replace(/\{you\}/g, you)
    .replace(/\{([^}]*)\}/g, "$1");

function respOf(a: { data?: unknown } | null | undefined): Responses {
  return ((a?.data as { responses?: Responses } | undefined)?.responses) ?? {};
}
const optOf = (q: GameQuestion, id?: string) => q.options?.find((o) => o.id === id);
// Text to show for a chosen option — its label, plus the typed note when it's a
// "Something else" answer.
const optText = (q: GameQuestion, id?: string, note?: string) => {
  const o = optOf(q, id);
  if (!o) return "—";
  return o.allowsNote && note?.trim() ? `${o.text}: ${note.trim()}` : o.text;
};

export default function GameExperience({ gameId, title, data }: { gameId: string; title: string; data: GameData }) {
  const { me } = useAuth();
  const inner: GameInner = data.game ?? data;
  const allQuestions = inner.questions ?? [];
  // Two game shapes: PartnerKnowledge questions carry `options`; YouOrMe
  // questions are a bare `prompt` ("Who's most likely to… <prompt>").
  const isYouOrMe =
    (inner.type || inner.coupleGameType) === "YouOrMe" ||
    (allQuestions.length > 0 && allQuestions.every((q) => !(q.options?.length ?? 0)));
  const questions = isYouOrMe
    ? allQuestions.filter((q) => q.id && q.prompt)
    : allQuestions.filter((q) => q.id && (q.options?.length ?? 0) > 0);
  const goal = inner.goal || inner.coupleGameGoal || "";
  const howItWorks = inner.howItWorks ?? [];
  const questionsIntro = inner.questionsIntro || "";
  const partnerName = me?.partner?.display_name ?? "Your partner";

  const [phase, setPhase] = useState<"intro" | "run" | "results">("intro");
  const [state, setState] = useState<AnswerState | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => answers.get("game", gameId).then(setState).catch(() => {});

  // Mid-run, browser back exits the run (same as the stepper's back from
  // question 1) rather than leaving the game entirely. Keeps the current URL.
  useScreenEntry(phase === "run", undefined, () => setPhase(state?.you_answered ? "results" : "intro"));

  useEffect(() => {
    answers
      .get("game", gameId)
      .then((s) => {
        setState(s);
        if (s.you_answered) setPhase("results");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) return <Spinner />;

  if (phase === "run")
    return isYouOrMe ? (
      <YomRunner
        gameId={gameId}
        questions={questions}
        questionsIntro={questionsIntro}
        partnerName={partnerName}
        initial={yomRespOf(state?.your_answer)}
        onExit={() => setPhase(state?.you_answered ? "results" : "intro")}
        onDone={(s) => {
          setState(s);
          setPhase("results");
        }}
      />
    ) : (
      <GameRunner
        gameId={gameId}
        questions={questions}
        partnerName={partnerName}
        initial={respOf(state?.your_answer)}
        onExit={() => setPhase(state?.you_answered ? "results" : "intro")}
        onDone={(s) => {
          setState(s);
          setPhase("results");
        }}
      />
    );

  if (phase === "results")
    return isYouOrMe ? (
      <YomResults
        title={title}
        questions={questions}
        questionsIntro={questionsIntro}
        state={state}
        partnerName={partnerName}
        paired={!!me?.paired}
        gameId={gameId}
        goal={goal}
        onState={setState}
        onRefresh={load}
      />
    ) : (
      <GameResults
        title={title}
        questions={questions}
        state={state}
        partnerName={partnerName}
        paired={!!me?.paired}
        gameId={gameId}
        goal={goal}
        onState={setState}
        onRefresh={load}
      />
    );

  return (
    <GameIntro
      title={title}
      goal={goal}
      howItWorks={howItWorks}
      count={questions.length}
      image={inner.mainImage?.url}
      answered={!!state?.you_answered}
      canStart={questions.length > 0}
      onStart={() => setPhase("run")}
      onResults={() => setPhase("results")}
    />
  );
}

// --------------------------------------------------------------------------- //
/** Icon in a soft round badge — the leading mark on each intro card. */
function CardIcon({ icon: Icon }: { icon: typeof Flag }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-500">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function GameIntro({
  title,
  goal,
  howItWorks,
  count,
  image,
  answered,
  canStart,
  onStart,
  onResults,
}: {
  title: string;
  goal: string;
  howItWorks: string[];
  count: number;
  image?: string | null;
  answered: boolean;
  canStart: boolean;
  onStart: () => void;
  onResults: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col pb-4">
      <HeroCard
        label="Game"
        title={title}
        image={image}
        meta={count > 0 ? `${count} ${count === 1 ? "question" : "questions"}` : undefined}
        decoration={
          <div aria-hidden className="pointer-events-none absolute inset-0 text-rose-300">
            <Heart className="absolute right-14 top-4 h-11 w-11 -rotate-12 fill-current opacity-70" />
            <Music className="absolute right-3 top-3 h-9 w-9 rotate-6 fill-current opacity-50" />
            <Sparkles className="absolute right-10 top-16 h-6 w-6 opacity-40" />
          </div>
        }
      />

      {goal && (
        <Card className="mt-3">
          <div className="mb-2 flex items-center gap-3">
            <CardIcon icon={Flag} />
            <span className="font-semibold text-stone-800">Goal</span>
          </div>
          <p className="leading-relaxed text-stone-600">{goal}</p>
        </Card>
      )}

      {howItWorks.length > 0 && (
        <Card className="mt-3 mb-3">
          <div className="mb-3 flex items-center gap-3">
            <CardIcon icon={Info} />
            <span className="font-semibold text-stone-800">How it works</span>
          </div>
          <ul>
            {howItWorks.map((h, i) => (
              <li key={i} className="flex gap-3">
                {/* Dot + dashed rail linking one step to the next. */}
                <div className="flex flex-col items-center">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                  {i < howItWorks.length - 1 && <span className="my-1.5 w-0 flex-1 border-l-2 border-dashed border-rose-200" />}
                </div>
                <p className={`leading-relaxed text-stone-600 ${i < howItWorks.length - 1 ? "pb-4" : ""}`}>{h}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* CTA parked at the bottom of the screen, so starting is always one tap
          away. `mt-auto` drops it there when the intro is short; `sticky` keeps
          it pinned once the intro is long enough to scroll. Not `fixed` — that
          anchors to the viewport, which sits below the app shell. */}
      <div
        className="mt-auto sticky bottom-0 z-10 -mx-4 px-4 pb-3"
      >
        <div className="pt-3">
          <Button onClick={onStart} disabled={!canStart}>{answered ? "Play again" : "Start game"}</Button>
          {answered && (
            <button onClick={onResults} className="w-full py-2.5 text-sm font-semibold text-rose-600">
              See results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Runner chrome. The two runners share a header (exit + segmented progress) and
// a sticky footer CTA, so the game reads as one flow rather than a form.
// --------------------------------------------------------------------------- //

/** Duolingo-style progress: one segment per question, filled as you go. */
function Stepper({ i, total, onBack }: { i: number; total: number; onBack: () => void }) {
  useSoloHeader(); // the stepper's back button is the screen's only one
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-pink-50/90 px-4 pb-3 pt-2 backdrop-blur-md">
      <button onClick={onBack} aria-label="Back" className="-ml-1 shrink-0 text-stone-400 active:scale-90 transition">
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }, (_, n) => (
          <span
            key={n}
            className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${n <= i ? "bg-rose-500" : "bg-stone-200"}`}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums text-stone-400">
        {i + 1}/{total}
      </span>
    </div>
  );
}

/** Sticky bottom CTA shared by both runners. Same trick as the intro CTA:
    `mt-auto` parks it at the bottom when the question is short, `sticky` keeps
    it pinned once the content is long enough to scroll. */
function RunnerFooter({ onNext, disabled, busy, isLast }: { onNext: () => void; disabled: boolean; busy: boolean; isLast: boolean }) {
  return (
    <div className="mt-auto sticky bottom-0 z-10 -mx-4 px-4 pb-3">
      <div className="pt-3">
        <Button onClick={onNext} disabled={disabled || busy}>
          {busy ? "Saving…" : isLast ? "Finish" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

/** Eyebrow + prompt heading above a choice group — says whose answer this is. */
function PromptBlock({ eyebrow, prompt, color }: { eyebrow: string; prompt: string; color: "rose" | "indigo" }) {
  return (
    <>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-400">
        <span className={`h-2 w-2 rounded-full ${color === "rose" ? "bg-rose-500" : "bg-indigo-500"}`} />
        {eyebrow}
      </p>
      <h2 className="mb-3 text-xl font-bold leading-snug text-stone-800">{prompt}</h2>
    </>
  );
}

// Chunky, pressable option styling. The thick bottom border lifts the button off
// the page and collapses on tap, which is what gives it the tactile feel.
const TONES = {
  rose: {
    on: "border-teal-600 bg-teal-50 text-teal-900",
    badgeOn: "border-teal-600 bg-teal-700 text-onaccent",
    focus: "focus:border-teal-600 focus:ring-teal-200",
  },
  indigo: {
    on: "border-indigo-400 bg-indigo-50 text-indigo-700",
    badgeOn: "border-indigo-400 bg-indigo-500 text-onaccent",
    focus: "focus:border-indigo-400 focus:ring-indigo-200",
  },
  emerald: {
    on: "border-emerald-400 bg-emerald-50 text-emerald-700",
    badgeOn: "border-emerald-400 bg-emerald-500 text-onaccent",
    focus: "focus:border-emerald-400 focus:ring-emerald-200",
  },
  amber: {
    on: "border-amber-400 bg-amber-50 text-amber-700",
    badgeOn: "border-amber-400 bg-amber-500 text-onaccent",
    focus: "focus:border-amber-400 focus:ring-amber-200",
  },
} as const;

const LETTERS = "ABCDEFGH";

function OptionGroup({
  options,
  value,
  note,
  onPick,
  onNote,
  color,
}: {
  options: GameOption[];
  value?: string;
  note?: string;
  onPick: (id: string) => void;
  onNote?: (text: string) => void;
  color: "rose" | "indigo";
}) {
  const tone = TONES[color];
  return (
    <div className="space-y-2.5">
      {options.map((o, n) => {
        const active = value === o.id;
        return (
          <div key={o.id}>
            <button
              onClick={() => onPick(o.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 px-3.5 py-3 text-left font-medium transition active:translate-y-[2px] active:border-b-2 ${
                active ? tone.on : "border-stone-200 bg-surface text-stone-800"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 text-xs font-bold transition ${
                  active ? tone.badgeOn : "border-stone-200 text-stone-400"
                }`}
              >
                {active ? <Check className="h-4 w-4" strokeWidth={3} /> : LETTERS[n] ?? n + 1}
              </span>
              <span className="flex-1">{o.text}</span>
            </button>
            {active && o.allowsNote && (
              <textarea
                autoFocus
                value={note ?? ""}
                onChange={(e) => onNote?.(e.target.value.slice(0, o.maxNoteLength ?? 5000))}
                maxLength={o.maxNoteLength ?? 5000}
                rows={2}
                placeholder="Type your answer…"
                className={`animate-rise-in mt-2 w-full rounded-2xl border-2 border-stone-200 bg-surface px-4 py-3 text-stone-800 outline-none focus:ring-2 ${tone.focus}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GameRunner({
  gameId,
  questions,
  partnerName,
  initial,
  onExit,
  onDone,
}: {
  gameId: string;
  questions: GameQuestion[];
  partnerName: string;
  initial: Responses;
  onExit: () => void;
  onDone: (s: AnswerState) => void;
}) {
  const [i, setI] = useState(0);
  const [responses, setResponses] = useState<Responses>(initial);
  const [busy, setBusy] = useState(false);

  const q = questions[i];
  const pick = responses[q.id] ?? {};
  const isLast = i === questions.length - 1;
  // A "Something else" pick isn't complete until its note is typed.
  const noteOk = (id?: string, note?: string) => {
    const o = optOf(q, id);
    return !o?.allowsNote || !!note?.trim();
  };
  const canNext =
    !!pick.mine && !!pick.guess && noteOk(pick.mine, pick.mineNote) && noteOk(pick.guess, pick.guessNote);

  const set = (key: "mine" | "guess", opt: string) =>
    setResponses((r) => ({ ...r, [q.id]: { ...r[q.id], [key]: opt } }));
  const setNote = (key: "mineNote" | "guessNote", text: string) =>
    setResponses((r) => ({ ...r, [q.id]: { ...r[q.id], [key]: text } }));

  const next = async () => {
    if (!isLast) return setI(i + 1);
    setBusy(true);
    try {
      onDone(await answers.submit({ content_type: "game", object_id: gameId, data: { responses } }));
    } finally {
      setBusy(false);
    }
  };
  const back = () => (i === 0 ? onExit() : setI(i - 1));

  return (
    <div className="flex flex-1 flex-col pb-4">
      <Stepper i={i} total={questions.length} onBack={back} />

      {/* Keyed on the question so each one animates in as you advance. */}
      <div key={q.id} className="animate-rise-in pt-3">
        <div className="mb-7">
          <PromptBlock eyebrow="Your answer" prompt={fill(q.userPrompt, "you", partnerName) || "Your answer"} color="rose" />
          <OptionGroup options={q.options ?? []} value={pick.mine} note={pick.mineNote} onPick={(o) => set("mine", o)} onNote={(t) => setNote("mineNote", t)} color="rose" />
        </div>

        <div className="border-t border-rose-100 pt-6">
          <PromptBlock
            eyebrow={`Your guess for ${partnerName}`}
            prompt={fill(q.partnerPrompt, "you", partnerName) || `Your guess for ${partnerName}`}
            color="indigo"
          />
          <OptionGroup options={q.options ?? []} value={pick.guess} note={pick.guessNote} onPick={(o) => set("guess", o)} onNote={(t) => setNote("guessNote", t)} color="indigo" />
        </div>
      </div>

      <RunnerFooter onNext={next} disabled={!canNext} busy={busy} isLast={isLast} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Results chrome, shared by both game shapes.
// --------------------------------------------------------------------------- //

/** Donut that sweeps up to the score on mount. */
function ScoreRing({ value, total }: { value: number; total: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 80);
    return () => window.clearTimeout(id);
  }, []);
  const C = 2 * Math.PI * 52;
  const pct = total ? value / total : 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-onaccent/25" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-onaccent transition-[stroke-dashoffset] duration-[900ms] ease-out"
          strokeDasharray={C}
          strokeDashoffset={shown ? C * (1 - pct) : C}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-3xl font-extrabold">{value}</span>
        <span className="mt-1 text-xs font-semibold text-onaccent/80">of {total}</span>
      </div>
    </div>
  );
}

/** Celebratory score banner shown once both partners have answered. */
function ScoreHero({ value, total, headline, sub }: { value: number; total: number; headline: string; sub: string }) {
  return (
    <div className="animate-rise-in relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-rose-400 p-5 text-onaccent">
      <Sparkles aria-hidden className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 text-onaccent/20" />
      <div className="relative flex items-center gap-5">
        <ScoreRing value={value} total={total} />
        <div className="min-w-0">
          <p className="text-xl font-extrabold leading-snug">{headline}</p>
          <p className="mt-1.5 text-sm text-onaccent/90">{sub}</p>
        </div>
      </div>
    </div>
  );
}

/** Stands in for the score while the partner still has answering to do. */
function WaitingCard({ partnerName, paired, gameId }: { partnerName: string; paired: boolean; gameId: string }) {
  return (
    <Card className="mt-3 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-50 text-rose-500">
        <Clock className="h-6 w-6" />
      </span>
      <p className="mt-3 font-bold text-stone-800">{paired ? `Waiting on ${partnerName}` : "Pair up to compare"}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-stone-500">
        {paired
          ? ``
          : "Link with your partner to see how your answers line up."}
      </p>
      {paired && (
        <div className="mt-4 flex justify-center">
          <NudgeButton kind="game" context={{ game_id: gameId }} />
        </div>
      )}
    </Card>
  );
}

/** Green "Match" / neutral "Miss" pill on a compared question. */
function Verdict({ match }: { match: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
        match ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"
      }`}
    >
      {match ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
      {match ? "Match" : "Miss"}
    </span>
  );
}

/** Names who a results row is about, and whether the guess in that row hit
 *  the answer beside it. Two verdicts, because the two guesses can disagree:
 *  you can nail theirs while they miss yours. */
function SideLabel({ name, match }: { name: string; match?: boolean | null }) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-stone-100 text-[10px] font-extrabold text-stone-500">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <p className="flex-1 text-xs font-bold text-stone-500">{name}</p>
      {match != null && <Verdict match={match} />}
    </div>
  );
}

/** One labelled answer in the results grid. `text: null` renders the muted
 *  waiting state for a partner side that isn't revealed yet. */
function AnswerCell({ label, text, tone }: { label: string; text: string | null; tone: "rose" | "indigo" | "stone" }) {
  const dot = tone === "rose" ? "bg-rose-500" : tone === "indigo" ? "bg-indigo-500" : "bg-stone-400";
  return (
    <div className="min-w-0 rounded-2xl bg-stone-50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">
        <span className={`h-2 w-2 shrink-0 rounded-full ${text == null ? "bg-stone-300" : dot}`} />
        <span className="truncate">{label}</span>
      </p>
      {text == null ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-400">
          <Clock className="h-3.5 w-3.5 shrink-0" /> Waiting
        </p>
      ) : (
        <p className="mt-0.5 text-sm text-stone-800">{text}</p>
      )}
    </div>
  );
}

/** Copy that reacts to the score, so the number lands as more than a number. */
const reaction = (value: number, total: number, high: string, mid: string, low: string) => {
  const pct = total ? value / total : 0;
  return pct >= 0.8 ? high : pct >= 0.4 ? mid : low;
};

/** Shared results header: title, then either the score or the waiting state. */
function ResultsHeader({
  title,
  goal,
  children,
}: {
  title: string;
  goal: string;
  children: ReactNode;
}) {
  return (
    <>
      <h1 className="text-2xl font-bold leading-snug text-stone-800">{title}</h1>
      {goal && (
        <p className="mt-1 flex items-start gap-1.5 text-sm text-stone-500">
          <Target className="mt-0.5 h-4 w-4 shrink-0" /> {goal}
        </p>
      )}
      {children}
    </>
  );
}

// --------------------------------------------------------------------------- //
function GameResults({
  title,
  questions,
  state,
  partnerName,
  paired,
  gameId,
  goal,
  onState,
  onRefresh,
}: {
  title: string;
  questions: GameQuestion[];
  state: AnswerState | null;
  partnerName: string;
  paired: boolean;
  gameId: string;
  goal: string;
  onState: (s: AnswerState) => void;
  onRefresh: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pick>({});
  const [busy, setBusy] = useState(false);

  const mine = respOf(state?.your_answer);
  const revealed = !!state?.revealed;
  const partner = revealed ? respOf(state?.partner_answer) : null;

  useEffect(() => {
    if (revealed || !paired) return;
    const id = window.setInterval(onRefresh, 15000);
    const vis = () => document.visibilityState === "visible" && onRefresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [revealed, paired, onRefresh]);

  // Score: how many of your guesses matched your partner's actual answer (and vice versa).
  let youCorrect = 0;
  let themCorrect = 0;
  if (partner) {
    for (const q of questions) {
      const m = mine[q.id] ?? {};
      const p = partner[q.id] ?? {};
      if (m.guess && p.mine && m.guess === p.mine) youCorrect++;
      if (p.guess && m.mine && p.guess === m.mine) themCorrect++;
    }
  }

  const startEdit = (q: GameQuestion) => {
    setEditingId(q.id);
    setDraft(mine[q.id] ?? {});
  };
  const editQ = questions.find((q) => q.id === editingId);
  const draftNoteOk = (id?: string, note?: string) => {
    const o = optOf(editQ ?? { id: "" }, id);
    return !o?.allowsNote || !!note?.trim();
  };
  const draftValid = !!draft.mine && !!draft.guess && draftNoteOk(draft.mine, draft.mineNote) && draftNoteOk(draft.guess, draft.guessNote);
  const saveEdit = async (qid: string) => {
    if (!draftValid) return;
    setBusy(true);
    try {
      const responses = { ...mine, [qid]: draft };
      onState(await answers.submit({ content_type: "game", object_id: gameId, data: { responses } }));
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const n = questions.length;
  return (
    <div className="pb-8">
      <ResultsHeader title={title} goal={goal}>
        {revealed ? (
          <div className="mt-3">
            <ScoreHero
              value={youCorrect}
              total={n}
              headline={reaction(youCorrect, n, "You know them well!", "Not bad at all", "Plenty left to discover")}
              sub={`${partnerName} guessed ${themCorrect} of ${n} about you`}
            />
          </div>
        ) : (
          <WaitingCard partnerName={partnerName} paired={paired} gameId={gameId} />
        )}
      </ResultsHeader>

      <div className="mt-4 space-y-2.5">
        {questions.map((q, idx) => {
          const m = mine[q.id] ?? {};
          const editing = editingId === q.id;
          const theirs = partner?.[q.id];
          // Two independent verdicts: your guess against their answer, and
          // their guess against yours.
          const correct = theirs && m.guess && theirs.mine ? m.guess === theirs.mine : null;
          const theirCorrect = theirs && theirs.guess && m.mine ? theirs.guess === m.mine : null;
          return (
            <Card key={q.id} className={correct === true ? "ring-2 ring-emerald-200" : ""}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
                  {idx + 1}
                </span>
                <p className="flex-1 font-semibold leading-snug text-stone-800">
                  {q.commonPrompt || fill(q.userPrompt, "you", partnerName)}
                </p>
                {!editing && (
                  <button
                    onClick={() => startEdit(q)}
                    aria-label="Edit answer"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:text-rose-500 active:scale-90"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {editing ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold text-rose-600">Your answer</p>
                  <OptionGroup options={q.options ?? []} value={draft.mine} note={draft.mineNote} onPick={(o) => setDraft((d) => ({ ...d, mine: o }))} onNote={(t) => setDraft((d) => ({ ...d, mineNote: t }))} color="rose" />
                  <p className="mb-1 mt-3 text-xs font-semibold text-indigo-600">Your guess for {partnerName}</p>
                  <OptionGroup options={q.options ?? []} value={draft.guess} note={draft.guessNote} onPick={(o) => setDraft((d) => ({ ...d, guess: o }))} onNote={(t) => setDraft((d) => ({ ...d, guessNote: t }))} color="indigo" />
                  <div className="mt-3 flex gap-3">
                    <button onClick={() => setEditingId(null)} className="flex-1 rounded-2xl border border-stone-200 bg-surface py-3 font-semibold text-stone-500">Cancel</button>
                    <Button onClick={() => saveEdit(q.id)} disabled={!draftValid || busy} className="flex-1">{busy ? "Saving…" : "Save"}</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {/* 2×2 grid: each row pairs a real answer (left) with the
                      other person's guess at it (right), so match-or-miss
                      reads straight across. Top row is about you, bottom row
                      about your partner. */}
                  <div className="space-y-1.5">
                    <SideLabel name="You" match={theirCorrect} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <AnswerCell label="Your answer" text={optText(q, m.mine, m.mineNote)} tone="rose" />
                      <AnswerCell
                        label={`${partnerName} guessed`}
                        text={theirs ? optText(q, theirs.guess, theirs.guessNote) : null}
                        tone="indigo"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <SideLabel name={partnerName} match={correct} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <AnswerCell
                        label={`${partnerName}'s answer`}
                        text={theirs ? optText(q, theirs.mine, theirs.mineNote) : null}
                        tone="rose"
                      />
                      <AnswerCell label="You guessed" text={optText(q, m.guess, m.guessNote)} tone="indigo" />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Both answered — talk the score over right here. Unlocks with `revealed`,
          which is exactly "both partners have answered" (same as quiz results). */}
      {revealed && <MessageThread contentType="game" objectId={gameId} partnerName={partnerName} />}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// YouOrMe — "Who's most likely to…". Each partner tags every prompt with a
// person; the aim is to have your answers point to the same person (a match).
// A choice is stored from the answerer's own perspective ("me" | "partner");
// "both" and "neither" mean the same thing from either side.
// --------------------------------------------------------------------------- //
type YomChoice = "me" | "partner" | "both" | "neither";
type YomResponses = Record<string, YomChoice>;
type YomTarget = "ME" | "PARTNER" | "BOTH" | "NEITHER";

function yomRespOf(a: { data?: unknown } | null | undefined): YomResponses {
  return ((a?.data as { responses?: YomResponses } | undefined)?.responses) ?? {};
}

// Resolve a stored choice to the person it points at, relative to the viewer.
// The partner's "me" is the viewer's partner, and vice-versa; "both" and
// "neither" need no flipping.
const yomTarget = (raw: YomChoice | undefined, isPartner: boolean): YomTarget | null => {
  if (raw == null) return null;
  if (raw === "both") return "BOTH";
  if (raw === "neither") return "NEITHER";
  return (raw === "me") === !isPartner ? "ME" : "PARTNER";
};

function YomPicker({ value, onPick, partnerName }: { value?: YomChoice; onPick: (c: YomChoice) => void; partnerName: string }) {
  const opts: { c: YomChoice; label: string; tone: keyof typeof TONES }[] = [
    { c: "me", label: "Me", tone: "rose" },
    { c: "partner", label: partnerName, tone: "indigo" },
    { c: "both", label: "Both of us", tone: "emerald" },
    { c: "neither", label: "Neither of us", tone: "amber" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const active = value === o.c;
        const t = TONES[o.tone];
        return (
          <button
            key={o.c}
            onClick={() => onPick(o.c)}
            className={`relative flex flex-col items-center gap-3 rounded-3xl border-2 border-b-4 px-3 py-6 font-bold transition active:translate-y-[2px] active:border-b-2 ${
              active ? t.on : "border-stone-200 bg-surface text-stone-800"
            }`}
          >
            <span
              className={`grid h-14 w-14 place-items-center rounded-full text-lg font-extrabold transition ${
                active ? t.badgeOn : "bg-stone-100 text-stone-400"
              }`}
            >
              {o.label.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="line-clamp-1 text-center">{o.label}</span>
            {active && (
              <span className={`absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full ${t.badgeOn}`}>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function YomRunner({
  gameId,
  questions,
  questionsIntro,
  partnerName,
  initial,
  onExit,
  onDone,
}: {
  gameId: string;
  questions: GameQuestion[];
  questionsIntro: string;
  partnerName: string;
  initial: YomResponses;
  onExit: () => void;
  onDone: (s: AnswerState) => void;
}) {
  const [i, setI] = useState(0);
  const [responses, setResponses] = useState<YomResponses>(initial);
  const [busy, setBusy] = useState(false);

  const q = questions[i];
  const isLast = i === questions.length - 1;
  const canNext = !!responses[q.id];

  const next = async () => {
    if (!isLast) return setI(i + 1);
    setBusy(true);
    try {
      onDone(await answers.submit({ content_type: "game", object_id: gameId, data: { responses } }));
    } finally {
      setBusy(false);
    }
  };
  const back = () => (i === 0 ? onExit() : setI(i - 1));

  return (
    <div className="flex flex-1 flex-col pb-4">
      <Stepper i={i} total={questions.length} onBack={back} />

      <div key={q.id} className="animate-rise-in pt-4">
        {/* The prompt is the hero here — one statement, one tap. */}
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-5 py-6 text-center">
          {questionsIntro && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-500">{questionsIntro}</p>
          )}
          <p className="text-2xl font-extrabold leading-snug text-stone-800">{q.prompt}</p>
        </div>

        <p className="my-5 text-center text-xs font-bold uppercase tracking-wide text-stone-400">Tap one</p>

        <YomPicker value={responses[q.id]} onPick={(c) => setResponses((r) => ({ ...r, [q.id]: c }))} partnerName={partnerName} />
      </div>

      <RunnerFooter onNext={next} disabled={!canNext} busy={busy} isLast={isLast} />
    </div>
  );
}

function YomResults({
  title,
  questions,
  questionsIntro,
  state,
  partnerName,
  paired,
  gameId,
  goal,
  onState,
  onRefresh,
}: {
  title: string;
  questions: GameQuestion[];
  questionsIntro: string;
  state: AnswerState | null;
  partnerName: string;
  paired: boolean;
  gameId: string;
  goal: string;
  onState: (s: AnswerState) => void;
  onRefresh: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = yomRespOf(state?.your_answer);
  const revealed = !!state?.revealed;
  const partner = revealed ? yomRespOf(state?.partner_answer) : null;

  useEffect(() => {
    if (revealed || !paired) return;
    const id = window.setInterval(onRefresh, 15000);
    const vis = () => document.visibilityState === "visible" && onRefresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [revealed, paired, onRefresh]);

  // A match = you both tagged the same person for that prompt.
  let matches = 0;
  if (partner) {
    for (const q of questions) {
      const mt = yomTarget(mine[q.id], false);
      const pt = yomTarget(partner[q.id], true);
      if (mt && pt && mt === pt) matches++;
    }
  }

  const label = (t: YomTarget | null) =>
    t === "ME" ? "You" : t === "PARTNER" ? partnerName : t === "BOTH" ? "Both of us" : t === "NEITHER" ? "Neither of us" : "—";

  const saveEdit = async (qid: string, choice: YomChoice) => {
    setBusy(true);
    try {
      const responses = { ...mine, [qid]: choice };
      onState(await answers.submit({ content_type: "game", object_id: gameId, data: { responses } }));
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const n = questions.length;
  return (
    <div className="pb-8">
      <ResultsHeader title={title} goal={goal}>
        {revealed ? (
          <div className="mt-3">
            <ScoreHero
              value={matches}
              total={n}
              headline={reaction(matches, n, "Totally in sync!", "Mostly on the same page", "You see this differently")}
              sub={`You and ${partnerName} picked the same answer ${matches} of ${n} times`}
            />
          </div>
        ) : (
          <WaitingCard partnerName={partnerName} paired={paired} gameId={gameId} />
        )}
      </ResultsHeader>

      <div className="mt-4 space-y-2.5">
        {questions.map((q, idx) => {
          const mt = yomTarget(mine[q.id], false);
          const pt = partner ? yomTarget(partner[q.id], true) : null;
          const match = mt && pt ? mt === pt : null;
          const editing = editingId === q.id;
          return (
            <Card key={q.id} className={match === true ? "ring-2 ring-emerald-200" : ""}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {questionsIntro && <p className="text-xs font-semibold text-stone-400">{questionsIntro}</p>}
                  <p className="font-semibold leading-snug text-stone-800">{q.prompt}</p>
                </div>
                {!editing && match !== null && <Verdict match={match} />}
                {!editing && (
                  <button
                    onClick={() => setEditingId(q.id)}
                    aria-label="Edit answer"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:text-rose-500 active:scale-90"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {editing ? (
                <div className="mt-3">
                  <YomPicker value={mine[q.id]} onPick={(c) => saveEdit(q.id, c)} partnerName={partnerName} />
                  <button onClick={() => setEditingId(null)} disabled={busy} className="mt-2 w-full rounded-2xl border border-stone-200 bg-surface py-3 font-semibold text-stone-500">Cancel</button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <AnswerCell label="You picked" text={label(mt)} tone="rose" />
                  <AnswerCell label={`${partnerName} picked`} text={partner ? label(pt) : null} tone="stone" />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {revealed && <MessageThread contentType="game" objectId={gameId} partnerName={partnerName} />}
    </div>
  );
}
