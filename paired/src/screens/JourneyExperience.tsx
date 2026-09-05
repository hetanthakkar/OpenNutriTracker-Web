import { useState } from "react";
import {
  Check, ChevronLeft, ChevronRight, ClipboardList, Dices, Flag, HeartHandshake, Hourglass,
  Lightbulb, Lock, MessageCircleQuestion, PartyPopper, Sparkles, type LucideIcon,
} from "lucide-react";
import { ApiError, journeys, type JourneyState, type MainImage } from "../api";
import { invalidate, keys, useQuery } from "../query";
import { useScreenEntry } from "../router";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { Avatar, Button, Card, HeroCard, HostBar, Spinner, useSoloHeader } from "../ui";
import QuestionExperience from "./QuestionExperience";
import QuizExperience, { type QuizData } from "./QuizExperience";
import GameExperience, { type GameData } from "./GameExperience";
import { asExercise, PartnerExercise, TipBody } from "./TipContent";

/**
 * A journey: a multi-day program a couple runs together. The overview shows
 * the hero, what you'll learn, and every step's days; starting it (one active
 * journey per couple) unlocks the days one by one — answering day N opens
 * day N+1, each partner at their own pace. A day is one of the four ordinary
 * activity types, rendered inline from the journey's payload: its items have
 * no standalone rows, but their answers flow through the same answer/reveal
 * machinery as everything else.
 */

// ---- The journey `data` payload (see content/journeys.py for the server view).
interface JourneyDay {
  day?: number;
  type?: string;
  id?: string;
  title?: string;
  content?: Record<string, unknown>;
}
interface JourneyStep {
  name?: string;
  description?: string;
  days?: JourneyDay[];
}
export interface JourneyData {
  name?: string;
  description?: string;
  author?: string;
  learnings?: string[];
  practicedSkills?: string[];
  steps?: JourneyStep[];
}

interface FlatDay {
  day: number;
  type: string;
  id: string;
  title: string;
  content: Record<string, unknown>;
  step?: string;
}

function flatDays(steps: JourneyStep[], partnerName?: string | null): FlatDay[] {
  const out: FlatDay[] = [];
  for (const s of steps) {
    for (const d of s.days ?? []) {
      if (!d.id) continue;
      const content = (d.content ?? {}) as Record<string, unknown>;
      out.push({
        day: d.day ?? out.length + 1,
        type: d.type ?? "question",
        id: d.id,
        // A day's scraped title bakes in the scrape account's partner ("M");
        // the invariant twin carries a placeholder for the reader's own.
        // Game days carry no day-level title — dig into the (wrapped) content.
        title: personalize(invariantTitle(content) || d.title || contentTitle(content) || "", partnerName),
        content,
        step: s.name,
      });
    }
  }
  out.sort((a, b) => a.day - b.day);
  return out;
}

const innerOf = (content: Record<string, unknown>) =>
  (typeof content.game === "object" && content.game ? content.game : content) as Record<string, unknown>;

function contentTitle(content: Record<string, unknown>): string | undefined {
  const inner = innerOf(content);
  return (inner.title as string) || (inner.name as string) || (inner.heading as string) || undefined;
}

function invariantTitle(content: Record<string, unknown>): string | undefined {
  const inner = innerOf(content);
  return (inner.invariantName as string) || (inner.invariantQuestion as string) || (inner.invariantHeading as string) || undefined;
}

/**
 * A journey has no top-level image — its illustration is echoed inside each
 * day's `content.journey`, so the first hit is the journey's own.
 */
function journeyImage(steps: JourneyStep[]): string | undefined {
  for (const step of steps) {
    for (const day of step.days ?? []) {
      const content = day.content as { journey?: { mainImage?: MainImage } } | undefined;
      const url = content?.journey?.mainImage?.url;
      if (url) return url;
    }
  }
  return undefined;
}

const DAY_TYPES: Record<string, { label: string; Icon: LucideIcon }> = {
  question: { label: "Question", Icon: MessageCircleQuestion },
  quiz: { label: "Quiz", Icon: ClipboardList },
  game: { label: "Game", Icon: Dices },
  tip: { label: "Article", Icon: Lightbulb },
};

export default function JourneyExperience({
  journeyId,
  title,
  data,
  openDay,
}: {
  journeyId: string;
  title: string;
  data: JourneyData;
  /** Open this day immediately — a nudge points at the day it was sent from,
   *  not at the journey overview. */
  openDay?: number;
}) {
  const { me } = useAuth();
  const stateKey = keys.journeyState(journeyId);
  const { data: state, error, refetch, set: setState } = useQuery(stateKey, () => journeys.state(journeyId));

  const partnerName = me?.partner?.display_name ?? "Your partner";
  const steps = data.steps ?? [];
  const days = flatDays(steps, me?.partner?.display_name);
  // Resolved eagerly rather than in an effect, so the day is on screen from the
  // first paint — the overview never flashes up before being replaced.
  const [openId, setOpenId] = useState<string | null>(
    () => days.find((d) => d.day === openDay)?.id ?? null,
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const flatById = new Map(days.map((d) => [d.id, d]));
  const dayState = new Map((state?.days ?? []).map((d) => [d.id, d]));
  // Sequential unlock: everything up to the first day you haven't answered.
  const unlockedThrough = state?.started ? state.your_day : 0;
  const currentDay = days.find((d) => d.day === unlockedThrough && !dayState.get(d.id)?.you_answered);

  const act = async (fn: () => Promise<JourneyState>) => {
    setBusy(true);
    setActionError(null);
    try {
      setState(await fn());
      invalidate("content:journeys"); // the list badge just changed
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- A day's activity, full screen; back returns to the overview. ----
  const open = openId ? days.find((d) => d.id === openId) : undefined;
  const closeDay = () => {
    setOpenId(null);
    // The day may have just been answered — reload progress and badges.
    invalidate(stateKey);
    invalidate("content:journeys");
  };
  useScreenEntry(!!open, open ? `/journeys/${journeyId}?day=${open.day}` : undefined, closeDay);
  if (open) {
    return <DayScreen day={open} totalDays={days.length} journeyTitle={title} onBack={closeDay} />;
  }

  return (
    <div className="pb-8">
      <HeroCard label="Journey" title={title} image={journeyImage(steps)} meta={data.author} />
      {data.description && <p className="text-stone-600 mt-4">{data.description}</p>}

      {/* ── Lifecycle card: start / continue / completed / pair first ── */}
      <div className="mt-4">
        {!state && !error && <div className="h-24 animate-pulse rounded-3xl border border-rose-100 bg-rose-50" />}
        {!state && !!error && (
          <Card className="text-center">
            <p className="text-sm text-stone-500">Couldn't load your progress.</p>
            <button onClick={refetch} className="mt-2 text-sm font-semibold text-rose-600">Try again</button>
          </Card>
        )}
        {state && (
          <StatusCard
            state={state}
            partnerName={partnerName}
            busy={busy}
            error={actionError}
            onStart={() => act(() => journeys.start(journeyId))}
            onLeave={() => act(() => journeys.leave(journeyId))}
            onContinue={currentDay ? () => setOpenId(currentDay.id) : undefined}
          />
        )}
      </div>

      {/* ── What you'll learn ── */}
      {(data.learnings?.length ?? 0) > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2.5">What you'll learn</h2>
          <Card>
            <ul className="space-y-2.5">
              {data.learnings!.map((l, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-stone-600 leading-snug">
                  <Sparkles className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  {l}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ── Skills chips ── */}
      {(data.practicedSkills?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.practicedSkills!.map((s, i) => (
            <span key={i} className="rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* ── Steps and their days ── */}
      {steps.map((s, i) => (
        <section key={i} className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Step {i + 1}</h2>
          <p className="mt-1 font-bold text-stone-800">{s.name}</p>
          {s.description && <p className="mt-0.5 mb-2.5 text-sm text-stone-500">{s.description}</p>}
          <div className="mt-2.5 space-y-2">
            {(s.days ?? []).filter((d) => d.id).map((d) => {
              const flat = flatById.get(d.id!);
              const st = dayState.get(d.id!);
              const dayNo = d.day ?? 0;
              const youDone = !!st?.you_answered;
              const unlocked = youDone || (state?.started ? dayNo <= unlockedThrough : false);
              return (
                <DayRow
                  key={d.id}
                  day={dayNo}
                  title={flat?.title ?? personalize(d.title, me?.partner?.display_name)}
                  type={d.type ?? "question"}
                  youDone={youDone}
                  partnerDone={!!st?.partner_answered}
                  unlocked={unlocked}
                  current={unlocked && !youDone}
                  youName={me?.display_name ?? "You"}
                  partnerName={me?.partner?.display_name ?? null}
                  onOpen={() => setOpenId(d.id!)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Lifecycle card
// --------------------------------------------------------------------------- //
function StatusCard({
  state,
  partnerName,
  busy,
  error,
  onStart,
  onLeave,
  onContinue,
}: {
  state: JourneyState;
  partnerName: string;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onLeave: () => void;
  onContinue?: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (state.completed) {
    return (
      <Card className="bg-emerald-50 border-emerald-100 text-center">
        <PartyPopper className="mx-auto h-9 w-9 text-emerald-500" strokeWidth={1.5} />
        <p className="mt-2 font-bold text-stone-800">Journey complete!</p>
        <p className="mt-1 text-sm text-stone-500">
          You and {partnerName} finished all {state.total_days} days. Revisit any day below.
        </p>
      </Card>
    );
  }

  if (state.started) {
    const doneCount = state.days.filter((d) => d.you_answered).length;
    const partnerDone = state.days.length > 0 && state.days.every((d) => d.partner_answered);
    const yourAllDone = doneCount === state.days.length;
    return (
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-bold text-stone-800">
            Day {state.your_day} <span className="font-semibold text-stone-400">of {state.total_days}</span>
          </p>
          <span className="text-xs font-semibold tabular-nums text-stone-400">{doneCount} done</span>
        </div>
        {/* Your progress */}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-rose-100">
          <div
            className="h-full rounded-full bg-rose-500 transition-all"
            style={{ width: `${state.days.length ? (doneCount / state.days.length) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
          <Hourglass className="h-3.5 w-3.5" />
          {partnerDone
            ? `${partnerName} has finished — your move!`
            : `${partnerName} is on day ${state.partner_day}`}
        </p>

        {yourAllDone ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" /> You've done every day — waiting for {partnerName} to finish.
          </p>
        ) : (
          onContinue && (
            <Button onClick={onContinue} className="mt-3">
              Continue — Day {state.your_day}
            </Button>
          )
        )}

        {confirmLeave ? (
          <div className="mt-3 text-center">
            <p className="text-sm text-stone-600 mb-2">Leave this journey? Your answers stay saved.</p>
            <Button onClick={() => { setConfirmLeave(false); onLeave(); }} disabled={busy}>
              {busy ? "Leaving…" : "Yes, leave journey"}
            </Button>
            <button onClick={() => setConfirmLeave(false)} className="w-full text-sm text-stone-400 py-2.5">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmLeave(true)} className="mt-3 w-full text-center text-xs font-semibold text-stone-400">
            Leave journey
          </button>
        )}
        {error && <p className="mt-2 text-sm text-rose-600 text-center">{error}</p>}
      </Card>
    );
  }

  if (!state.paired) {
    return (
      <Card className="bg-rose-50 border-rose-100 text-center">
        <HeartHandshake className="mx-auto h-8 w-8 text-rose-500" strokeWidth={1.5} />
        <p className="mt-2 font-bold text-stone-800">Journeys are for the two of you</p>
        <p className="mt-1 text-sm text-stone-500">Pair with your partner from the Us tab to start one together.</p>
      </Card>
    );
  }

  if (state.blocking_journey) {
    return (
      <Card className="bg-amber-50 border-amber-100">
        <p className="flex items-center gap-2 font-bold text-stone-800">
          <Flag className="h-4 w-4 text-amber-500" /> One journey at a time
        </p>
        <p className="mt-1 text-sm text-stone-500">
          You're in the middle of “{state.blocking_journey.name}”. Finish or leave it to start this one.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <Button onClick={onStart} disabled={busy}>
        {busy ? "Starting…" : `Start journey — ${state.total_days} days`}
      </Button>
      <p className="mt-2 text-center text-xs text-stone-400">
        One activity a day, together. Answering a day unlocks the next.
      </p>
      {error && <p className="mt-2 text-sm text-rose-600 text-center">{error}</p>}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// One day in the outline
// --------------------------------------------------------------------------- //
function DayRow({
  day,
  title,
  type,
  youDone,
  partnerDone,
  unlocked,
  current,
  youName,
  partnerName,
  onOpen,
}: {
  day: number;
  title: string;
  type: string;
  youDone: boolean;
  partnerDone: boolean;
  unlocked: boolean;
  current: boolean;
  youName: string;
  partnerName: string | null;
  onOpen: () => void;
}) {
  const meta = DAY_TYPES[type] ?? DAY_TYPES.question;
  return (
    <button
      onClick={onOpen}
      disabled={!unlocked}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left shadow-sm transition ${
        current ? "border-rose-300 ring-1 ring-rose-200 active:scale-[0.99]"
          : unlocked ? "border-rose-50 active:scale-[0.99]"
          : "border-stone-100 opacity-55"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
          youDone ? "bg-emerald-100 text-emerald-600" : current ? "bg-rose-500 text-onaccent" : "bg-stone-100 text-stone-400"
        }`}
      >
        {youDone ? <Check className="h-5 w-5" /> : unlocked ? day : <Lock className="h-4 w-4" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-stone-800 line-clamp-2">{title || `Day ${day}`}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
          <meta.Icon className="h-3.5 w-3.5" /> Day {day} · {meta.label}
        </span>
      </span>

      {(youDone || (partnerDone && partnerName)) && (
        <span className="flex shrink-0 -space-x-1.5">
          {youDone && <Avatar name={youName} tone="rose" className="ring-2 ring-surface" />}
          {partnerDone && partnerName && <Avatar name={partnerName} tone="indigo" className="ring-2 ring-surface" />}
        </span>
      )}
      {unlocked && <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />}
    </button>
  );
}

// --------------------------------------------------------------------------- //
// A single day's activity, rendered inline from the journey payload
// --------------------------------------------------------------------------- //
function DayScreen({
  day,
  totalDays,
  journeyTitle,
  onBack,
}: {
  day: FlatDay;
  totalDays: number;
  journeyTitle: string;
  onBack: () => void;
}) {
  const c = day.content;
  // This screen's back link replaces the detail view's back arrow, and a
  // quiz/game runner inside the day replaces this link in turn — one back
  // control at a time (see HostBar).
  useSoloHeader();
  return (
    // Continue the screen shell's flex column — the activities inside (docked
    // question composer, game runner footers) size themselves with `flex-1` /
    // `mt-auto`, which a plain block div here would silently disable.
    <div className="flex flex-1 flex-col">
      <HostBar
        bar={
          <>
            {/* -ml-1 hangs the chevron in the gutter so the label's left edge
                lines up with the eyebrow and title below it, the same trim
                GameExperience's back button uses. The icon carries its own side
                padding inside the box, hence gap-0.5 rather than gap-1. */}
            <button onClick={onBack} className="-ml-1 flex items-center gap-0.5 pb-1 text-sm font-medium text-rose-600 active:scale-95 transition">
              <ChevronLeft className="h-4 w-4 shrink-0" /> {journeyTitle}
            </button>
            <p className="pb-3 text-xs font-bold uppercase tracking-widest text-stone-400">
              Day {day.day} of {totalDays}
              {day.step ? ` · ${day.step}` : ""}
            </p>
          </>
        }
      >
        <DayActivity day={day} content={c} />
      </HostBar>
    </div>
  );
}

function DayActivity({ day, content }: { day: FlatDay; content: Record<string, unknown> }) {
  if (day.type === "question") {
    const q = content as {
      question?: string;
      invariantQuestion?: string;
      hint?: string;
      evidence?: string;
      mainImage?: MainImage;
      topics?: { name?: string }[];
    };
    return (
      <QuestionExperience
        questionId={day.id}
        // The scraped `question` bakes in the scrape account's partner name —
        // QuestionExperience fills the invariant's placeholder with the reader's.
        prompt={q.invariantQuestion || q.question || day.title}
        topic={q.topics?.[0]?.name}
        evidence={q.evidence}
        image={q.mainImage?.url}
      />
    );
  }

  if (day.type === "quiz") {
    const title =
      (content.invariantHeading as string) || (content.invariantName as string) ||
      (content.title as string) || (content.heading as string) || day.title || "Quiz";
    return <QuizExperience quizId={day.id} title={title} data={content as QuizData} />;
  }

  if (day.type === "game") {
    // The payload wraps couple games in a `game` key; GameExperience unwraps it.
    const inner = ((content.game as Record<string, unknown> | undefined) ?? content);
    const title = (inner.title as string) || (inner.name as string) || day.title || "Game";
    return <GameExperience gameId={day.id} title={title} data={content as GameData} />;
  }

  if (day.type === "tip") {
    return <TipDay dayId={day.id} fallbackTitle={day.title} content={content} />;
  }

  return <Spinner />;
}

function TipDay({
  dayId,
  fallbackTitle,
  content,
}: {
  dayId: string;
  fallbackTitle: string;
  content: Record<string, unknown>;
}) {
  const html = (content.text as { html?: string } | undefined)?.html ?? "";
  const author = (content.author as { name?: string; headline?: string } | undefined) ?? {};
  const exercise = asExercise(content.partnerExercise);
  return (
    <div className="pb-8">
      <h1 className="text-2xl font-bold leading-snug text-stone-800">
        {(content.title as string) || fallbackTitle}
      </h1>
      {typeof content.description === "string" && content.description && (
        <p className="mt-1 text-stone-600">{content.description}</p>
      )}
      {author.name && (
        <p className="mt-1 text-sm text-stone-400">
          {author.name}
          {author.headline ? ` · ${author.headline}` : ""}
        </p>
      )}
      {html && <TipBody html={html} />}
      {exercise && <PartnerExercise tipId={dayId} exercise={exercise} />}
    </div>
  );
}
