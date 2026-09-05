import { useState } from "react";
import { Check, Handshake, HeartHandshake, Hourglass } from "lucide-react";
import { answers, type AnswerState } from "../api";
import { invalidate, keys, useQuery } from "../query";
import { useAuth } from "../auth";
import { Button, Card, NudgeButton } from "../ui";

/**
 * The two halves of a tip, shared by the Tips collection detail and a
 * journey's tip days: the article body, and the partner exercise wired into
 * the answer/reveal system.
 */

/** Article HTML, stripped of the scrape's empty spacer paragraphs. */
export function TipBody({ html }: { html: string }) {
  return (
    <div
      className="prose mt-4 max-w-none"
      dangerouslySetInnerHTML={{
        __html: html.replace(/<p[^>]*>(\s|<br\s*\/?>|&nbsp;)*<\/p>/gi, ""),
      }}
    />
  );
}

// --------------------------------------------------------------------------- //
// Partner exercise — the interactive prompt + options; both partners' choices
// compare once each has picked.
// --------------------------------------------------------------------------- //
interface ExOption {
  id: string;
  text: string;
}
export interface Exercise {
  prompt: string;
  options: ExOption[];
}

export function asExercise(v: unknown): Exercise | null {
  if (v && typeof v === "object" && Array.isArray((v as { options?: unknown }).options)) {
    return v as Exercise;
  }
  return null;
}

function optionId(a: { data?: unknown } | null | undefined): string | null {
  const d = a?.data as { optionId?: string } | undefined;
  return d?.optionId ?? null;
}

export function PartnerExercise({ tipId, exercise }: { tipId: string; exercise: Exercise }) {
  const { me } = useAuth();
  const { data: state, set: setState } = useQuery(keys.answer("tip", tipId), () => answers.get("tip", tipId));
  const [touched, setTouched] = useState<string | null>(null); // tapped but not yet submitted
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const savedSel = optionId(state?.your_answer);
  // Before the user taps anything, the saved answer is what shows as selected.
  const pending = touched ?? savedSel;
  const partnerSel = state?.revealed ? optionId(state?.partner_answer) : null;
  const partnerName = me?.partner?.display_name ?? "Partner";
  const canSubmit = !!pending && pending !== savedSel && !busy;

  const submit = async () => {
    const opt = exercise.options.find((o) => o.id === pending);
    if (!opt) return;
    setBusy(true);
    try {
      setState(await answers.submit({ content_type: "tip", object_id: tipId, text: opt.text, data: { optionId: opt.id } }));
      invalidate(keys.activity); // this tip just moved in the Discuss list
      setRecorded(true);
      setTimeout(() => setRecorded(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6 bg-indigo-50 border-indigo-100">
      <div className="flex items-center gap-2 text-indigo-600 mb-2">
        <Handshake className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Partner exercise</span>
      </div>
      <p className="font-semibold text-stone-800 mb-3">{exercise.prompt}</p>
      <div className="space-y-2">
        {exercise.options.map((opt) => {
          const selected = pending === opt.id; // the user's current (tappable) choice
          const theirs = partnerSel === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setTouched(opt.id)}
              className={`w-full text-left rounded-2xl border px-4 py-3 transition active:scale-[0.99] ${selected ? "border-rose-400 bg-rose-50 ring-1 ring-rose-300" : theirs ? "border-indigo-300 bg-surface" : "border-stone-200 bg-surface"
                }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-800">{opt.text}</span>
                <span className="flex gap-1 shrink-0 text-xs font-semibold">
                  {savedSel === opt.id && <span className="text-rose-500">You</span>}
                  {theirs && <span className="text-indigo-500">{partnerName}</span>}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Button onClick={submit} disabled={!canSubmit} className="mt-3">
        {busy ? "Saving…" : savedSel ? "Update answer" : "Submit answer"}
      </Button>

      {recorded && (
        <p className="text-sm text-emerald-600 font-medium mt-3 flex items-center justify-center gap-1">
          <Check className="h-4 w-4" /> Answer recorded
        </p>
      )}
      <ExerciseStatus state={state} paired={!!me?.paired} partnerName={partnerName} tipId={tipId} />
    </Card>
  );
}

function ExerciseStatus({ state, paired, partnerName, tipId }: { state?: AnswerState; paired: boolean; partnerName: string; tipId: string }) {
  if (!state?.you_answered) return null;
  if (state.revealed) return <p className="text-xs text-indigo-500 mt-3 flex items-center gap-1">You both answered <HeartHandshake className="h-3.5 w-3.5" /></p>;
  if (!paired) return <p className="text-xs text-stone-400 mt-3">Pair with your partner to compare answers.</p>;
  return (
    <div className="flex items-center justify-between gap-3 mt-3">
      <p className="text-xs text-stone-400 flex items-center gap-1">Waiting for {partnerName}… <Hourglass className="h-3.5 w-3.5" /></p>
      <NudgeButton kind="tip" context={{ tip_id: tipId }} className="text-xs px-3 py-1.5" />
    </div>
  );
}
