import { useEffect, useState } from "react";
import { ChevronLeft, Clock, Flag, Heart, Info, Lightbulb, Pencil } from "lucide-react";
import { answers, type AnswerState, type MainImage } from "../api";
import { invalidate, keys } from "../query";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { Button, Card, HeroCard, NudgeButton, Spinner, useSoloHeader } from "../ui";
import { useScreenEntry } from "../router";
import { MessageThread } from "./QuestionExperience";

/** Answering a quiz may have been *today's* quiz, and the Home hero reads its
 *  own `daily` payload for that state. Without this it keeps saying "Take the
 *  quiz" until the cache goes stale on its own. */
function refreshDaily() {
  invalidate(keys.daily);
  invalidate(keys.activity); // whose turn it is just changed
}

interface QuizQuestion {
  id: string;
  question?: string | null;
  commonQuestion?: string | null;
  expertTip?: string | null;
}
export interface QuizData {
  goal?: string;
  research?: string;
  howItWorks?: string[];
  quizQuestions?: QuizQuestion[];
  mainImage?: MainImage;
  // The scraped name/heading bake in the scrape account's partner name; the
  // invariant twins carry a `%{partnerName}` placeholder instead.
  invariantName?: string | null;
  invariantHeading?: string | null;
}

type Responses = Record<string, number>;
type Notes = Record<string, string>;

const SCALE_LABELS = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
// Prefer the generic wording ("my partner") — the personalised `question` bakes
// in the other partner's initial, which we don't substitute.
const qText = (q: QuizQuestion) => q.commonQuestion || q.question || "";

function respOf(a: { data?: unknown } | null | undefined): Responses {
  return ((a?.data as { responses?: Responses } | undefined)?.responses) ?? {};
}
function notesOf(a: { data?: unknown } | null | undefined): Notes {
  return ((a?.data as { notes?: Notes } | undefined)?.notes) ?? {};
}

export default function QuizExperience({ quizId, title, data }: { quizId: string; title: string; data: QuizData }) {
  const { me } = useAuth();
  const quizTitle = personalize(data.invariantHeading || data.invariantName || title, me?.partner?.display_name);
  const questions = (data.quizQuestions ?? []).filter((q) => q.id);
  const [phase, setPhase] = useState<"intro" | "run" | "results">("intro");
  const [state, setState] = useState<AnswerState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => answers.get("quiz", quizId).then(setState).catch(() => {});

  // Mid-run, browser back exits the run (same as the runner's own back from
  // question 1) rather than leaving the quiz entirely. Keeps the current URL.
  useScreenEntry(phase === "run", undefined, () => setPhase(state?.you_answered ? "results" : "intro"));

  useEffect(() => {
    answers
      .get("quiz", quizId)
      .then((s) => {
        setState(s);
        if (s.you_answered) setPhase("results");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [quizId]);

  if (loading) return <Spinner />;

  if (phase === "run")
    return (
      <QuizRunner
        quizId={quizId}
        questions={questions}
        initialResponses={respOf(state?.your_answer)}
        initialNotes={notesOf(state?.your_answer)}
        onExit={() => setPhase(state?.you_answered ? "results" : "intro")}
        onDone={(s) => {
          setState(s);
          setPhase("results");
        }}
      />
    );

  if (phase === "results")
    return (
      <QuizResults
        title={quizTitle}
        questions={questions}
        state={state}
        fallbackInsight={data.research ?? ""}
        partnerName={me?.partner?.display_name ?? "Your partner"}
        paired={!!me?.paired}
        quizId={quizId}
        onState={setState}
        onRefresh={load}
      />
    );

  return (
    <QuizIntro
      title={quizTitle}
      data={data}
      answered={!!state?.you_answered}
      canStart={questions.length > 0}
      onStart={() => setPhase("run")}
      onResults={() => setPhase("results")}
    />
  );
}

// --------------------------------------------------------------------------- //
// Intro
// --------------------------------------------------------------------------- //
function QuizIntro({
  title,
  data,
  answered,
  canStart,
  onStart,
  onResults,
}: {
  title: string;
  data: QuizData;
  answered: boolean;
  canStart: boolean;
  onStart: () => void;
  onResults: () => void;
}) {
  const count = data.quizQuestions?.length ?? 0;
  return (
    <div className="pb-8">
      <div className="mb-4">
        <HeroCard
          label="Quiz"
          title={title}
          image={data.mainImage?.url}
          meta={count > 0 ? `${count} ${count === 1 ? "question" : "questions"}` : undefined}
        />
      </div>

      {data.goal && (
        <Card className="mb-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800 mb-1"><Flag className="h-4 w-4 text-rose-500" /> Goal</div>
          <p className="text-stone-600">{data.goal}</p>
        </Card>
      )}
      {data.research && (
        <Card className="mb-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800 mb-1"><Lightbulb className="h-4 w-4 text-rose-500" /> Research</div>
          <p className="text-stone-600">{data.research}</p>
        </Card>
      )}
      {data.howItWorks && data.howItWorks.length > 0 && (
        <Card className="mb-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800 mb-2"><Info className="h-4 w-4 text-rose-500" /> How it works</div>
          <ul className="space-y-2">
            {data.howItWorks.map((h, i) => (
              <li key={i} className="flex gap-2 text-stone-600"><span className="text-rose-400">•</span>{h}</li>
            ))}
          </ul>
        </Card>
      )}

      <Button onClick={onStart} disabled={!canStart} className="mt-2">{answered ? "Retake quiz" : "Start quiz"}</Button>
      {answered && (
        <button onClick={onResults} className="w-full text-rose-600 text-sm py-3">See your results</button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Runner — one question at a time, Likert scale + optional note
// --------------------------------------------------------------------------- //
function QuizRunner({
  quizId,
  questions,
  initialResponses,
  initialNotes,
  onExit,
  onDone,
}: {
  quizId: string;
  questions: QuizQuestion[];
  initialResponses: Responses;
  initialNotes: Notes;
  onExit: () => void;
  onDone: (s: AnswerState) => void;
}) {
  const [i, setI] = useState(0);
  const [responses, setResponses] = useState<Responses>(initialResponses);
  const [notes, setNotes] = useState<Notes>(initialNotes);
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  useSoloHeader(); // the runner's back button is the screen's only one

  const q = questions[i];
  const value = responses[q.id];
  const isLast = i === questions.length - 1;

  const next = async () => {
    if (!isLast) {
      setShowNote(false);
      setI(i + 1);
      return;
    }
    setBusy(true);
    try {
      onDone(await answers.submit({ content_type: "quiz", object_id: quizId, data: { responses, notes } }));
      refreshDaily();
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (i === 0) return onExit();
    setShowNote(false);
    setI(i - 1);
  };

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3 pb-4">
        <button onClick={back} aria-label="Back" className="text-rose-600"><ChevronLeft className="h-6 w-6" /></button>
        <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${((i + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <div className="pt-2">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400">Question {i + 1} of {questions.length}</p>
        <h2 className="text-xl font-bold leading-snug text-stone-800">{qText(q)}</h2>
      </div>

      <div className="mt-5">
        <LikertPicker value={value} onPick={(v) => setResponses((r) => ({ ...r, [q.id]: v }))} size="lg" />
      </div>

      {(showNote || notes[q.id]) && (
        <textarea
          value={notes[q.id] ?? ""}
          onChange={(e) => setNotes((n) => ({ ...n, [q.id]: e.target.value }))}
          rows={2}
          placeholder="Add a note (optional)…"
          className="mt-4 w-full rounded-2xl border border-stone-200 bg-surface px-4 py-3 outline-none focus:border-rose-400 resize-none"
        />
      )}

      <div className="flex gap-3 mt-4">
        <button
          onClick={() => setShowNote((s) => !s)}
          className="flex-1 rounded-2xl border border-stone-200 bg-surface py-3.5 text-stone-600 font-semibold active:scale-[0.98] transition"
        >
          <Pencil className="inline h-4 w-4 mr-1 align-text-bottom" /> Add note
        </button>
        <Button onClick={next} disabled={!value || busy} className="flex-1">
          {busy ? "Saving…" : isLast ? "Finish" : "Next"}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Results — your answers vs partner's (reveal), with per-question insight
// --------------------------------------------------------------------------- //
function QuizResults({
  title,
  questions,
  state,
  fallbackInsight,
  partnerName,
  paired,
  quizId,
  onState,
  onRefresh,
}: {
  title: string;
  questions: QuizQuestion[];
  state: AnswerState | null;
  fallbackInsight: string;
  partnerName: string;
  paired: boolean;
  quizId: string;
  onState: (s: AnswerState) => void;
  onRefresh: () => void;
}) {
  const [showInsight, setShowInsight] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<number | undefined>(undefined);
  const [draftNote, setDraftNote] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = respOf(state?.your_answer);
  const myNotes = notesOf(state?.your_answer);
  const revealed = !!state?.revealed;
  const partner = revealed ? respOf(state?.partner_answer) : null;

  // Poll so the partner's answers appear as soon as they finish.
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

  const startEdit = (q: QuizQuestion) => {
    setEditingId(q.id);
    setDraftValue(mine[q.id]);
    setDraftNote(myNotes[q.id] ?? "");
  };

  const saveEdit = async (qid: string) => {
    if (!draftValue) return;
    setBusy(true);
    try {
      const responses = { ...mine, [qid]: draftValue };
      const notes = { ...myNotes, [qid]: draftNote };
      onState(await answers.submit({ content_type: "quiz", object_id: quizId, data: { responses, notes } }));
      refreshDaily();
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-8">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-stone-800 mb-1.5">{title}</h1>
      <p className="text-sm text-stone-500 mb-6">
        {revealed ? "Compare your answers" : paired ? `Awaiting ${partnerName}'s answers…` : "Pair up to compare answers."}
      </p>

      {!revealed && paired && (
        <div className="flex justify-center mb-4">
          <NudgeButton kind="quiz" context={{ quiz_id: quizId }} />
        </div>
      )}

      {fallbackInsight && (
        <Card className="mb-4 bg-rose-50 border-rose-100">
          <button
            onClick={() => setShowInsight((s) => !s)}
            className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-rose-600"
          >
            <span className="flex items-center gap-1.5"><Lightbulb className="h-4 w-4 shrink-0" /> How will this help your relationship?</span>
            <span className="text-lg leading-none">{showInsight ? "−" : "+"}</span>
          </button>
          {showInsight && <p className="text-sm text-stone-600 mt-2">{fallbackInsight}</p>}
        </Card>
      )}

      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-stone-400">Your answers</h2>
      <div className="space-y-2">
        {questions.map((q, idx) => {
          const editing = editingId === q.id;
          return (
            <Card key={q.id}>
              <div className="flex gap-2">
                <span className="text-rose-400 font-semibold">{idx + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-stone-800">{qText(q)}</p>
                    {!editing && (
                      <button
                        onClick={() => startEdit(q)}
                        aria-label="Edit answer"
                        className="shrink-0 h-8 w-8 grid place-items-center rounded-full text-stone-400 hover:text-rose-500 active:scale-90 transition"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <div className="mt-3">
                      <LikertPicker value={draftValue} onPick={setDraftValue} />
                      <textarea
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        rows={2}
                        placeholder="Add a note (optional)…"
                        className="mt-3 w-full rounded-2xl border border-stone-200 bg-surface px-4 py-3 outline-none focus:border-rose-400 resize-none"
                      />
                      <div className="flex gap-3 mt-3">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 rounded-2xl border border-stone-200 bg-surface py-3 text-stone-500 font-semibold"
                        >
                          Cancel
                        </button>
                        <Button onClick={() => saveEdit(q.id)} disabled={!draftValue || busy} className="flex-1">
                          {busy ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2">
                        <ScaleDots value={mine[q.id]} label="You" color="rose" />
                        {partner ? (
                          <ScaleDots value={partner[q.id]} label={partnerName} color="indigo" />
                        ) : (
                          <span className="text-xs text-stone-400 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {partnerName}</span>
                        )}
                      </div>
                      {myNotes[q.id] ? <p className="text-sm text-stone-500 italic mt-2">“{myNotes[q.id]}”</p> : null}
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Both answered — talk it over right here. The thread (and the backend)
          unlock together: `revealed` is exactly "both partners have answered". */}
      {revealed && <MessageThread contentType="quiz" objectId={quizId} partnerName={partnerName} />}
    </div>
  );
}

/**
 * One notch of the agree/disagree scale. The heart grows and fills a step
 * further with each notch, so the row reads as a ramp from strongly disagree to
 * strongly agree before anything is picked — the fill is clipped from the
 * bottom up, the same direction the scale climbs.
 */
function ScaleHeart({ step, selected }: { step: number; selected: boolean }) {
  const size = 13 + step * 3;
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <Heart
        className={`absolute h-full w-full fill-current ${selected ? "text-rose-500" : "text-stone-200"}`}
        strokeWidth={0}
        style={{ clipPath: `inset(${100 - step * 20}% 0 0 0)` }}
      />
      <Heart className={`absolute h-full w-full ${selected ? "text-rose-500" : "text-stone-300"}`} />
    </span>
  );
}

function LikertPicker({ value, onPick, size = "md" }: { value?: number; onPick: (v: number) => void; size?: "md" | "lg" }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-stone-500 mb-2">
        <span>Strongly disagree</span>
        <span>Strongly agree</span>
      </div>
      <div className="flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onPick(v)}
            aria-label={SCALE_LABELS[v - 1]}
            aria-pressed={value === v}
            className={`${size === "lg" ? "h-14" : "h-12"} flex-1 rounded-full grid place-items-center transition active:scale-90 border-2 ${
              value === v ? "bg-rose-50 border-rose-500" : "bg-surface border-stone-200"
            }`}
          >
            <ScaleHeart step={v} selected={value === v} />
          </button>
        ))}
      </div>
      {value ? <p className="text-center text-xs text-stone-400 mt-2">{SCALE_LABELS[value - 1]}</p> : null}
    </div>
  );
}

function ScaleDots({ value, label, color }: { value?: number; label: string; color: "rose" | "indigo" }) {
  const fill = color === "rose" ? "bg-rose-500" : "bg-indigo-500";
  const text = color === "rose" ? "text-rose-500" : "text-indigo-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-semibold ${text}`}>{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <span key={v} className={`h-2 w-2 rounded-full ${value === v ? fill : "bg-stone-200"}`} />
        ))}
      </div>
    </div>
  );
}
