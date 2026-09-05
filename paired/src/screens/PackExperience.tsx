import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { answers, type AnswerState } from "../api";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { Avatar, BlurredAnswer, Button, Card, NudgeButton } from "../ui";

interface PackQuestion {
  id: string;
  index?: number;
  question?: string | null;
  hint?: string | null;
  topic?: string | null;
}
interface PackData {
  description?: string | null;
  questions?: PackQuestion[];
}

/**
 * A single free-text answer with the answer-then-reveal rule: submit your
 * answer, see your partner's once they've answered the same item, and edit
 * yours anytime. Reused for every question in a pack.
 */
export function AnswerBox({
  contentType,
  objectId,
  onState,
  dock = false,
}: {
  contentType: string;
  objectId: string;
  onState?: (s: AnswerState) => void;
  /** Full-height layout: content flows at top, composer docks to the bottom. */
  dock?: boolean;
}) {
  const { me } = useAuth();
  const [state, setState] = useState<AnswerState | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const partnerName = me?.partner?.display_name ?? "Your partner";
  const yourName = me?.display_name ?? "You";
  const paired = !!me?.paired;

  const load = () =>
    answers
      .get(contentType, objectId)
      .then((s) => {
        setState(s);
        setText(s.your_answer?.text ?? "");
        onState?.(s);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, objectId]);

  const answered = !!state?.you_answered;
  const revealed = !!state?.revealed;

  // Poll for the partner's answer while waiting.
  useEffect(() => {
    if (!answered || revealed || !paired) return;
    const id = window.setInterval(load, 15000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, revealed, paired]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const s = await answers.submit({ content_type: contentType, object_id: objectId, text: text.trim() });
      setState(s);
      onState?.(s);
      setEditing(false);
      setRecorded(true);
      setTimeout(() => setRecorded(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  const composing = !answered || editing;

  // ── Your saved answer ────────────────────────────────────────────────
  const answeredCard = (
    <div className="rounded-2xl bg-stone-50 border border-stone-100 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Avatar name={yourName} tone="stone" />
          <span className="text-xs font-semibold text-stone-500">Your answer</span>
        </div>
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit answer"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-stone-400 hover:text-rose-500 hover:bg-surface active:scale-95 transition"
        >
          <PencilIcon /> Edit
        </button>
      </div>
      <p className="text-[15px] leading-relaxed text-stone-800 whitespace-pre-wrap">{state?.your_answer?.text}</p>
    </div>
  );

  // ── Partner reveal / waiting ─────────────────────────────────────────
  const revealBlock =
    revealed && state?.partner_answer ? (
      <div className="animate-rise-in rounded-2xl bg-rose-50 border border-rose-100 p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Avatar name={partnerName} tone="rose" />
          <span className="text-xs font-semibold text-rose-600">{partnerName}</span>
        </div>
        <p className="text-[15px] leading-relaxed text-stone-800 whitespace-pre-wrap">{state.partner_answer.text}</p>
      </div>
    ) : !paired ? (
      <p className="text-xs text-stone-400">Pair with your partner to compare answers.</p>
    ) : (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-stone-200 px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm text-stone-400">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300 animate-bounce" />
          </span>
          Waiting for {partnerName}
        </div>
        <NudgeButton kind="pack" context={{ object_id: objectId }} className="text-xs px-3 py-1.5" />
      </div>
    );

  const recordedPill = recorded && (
    <div className="animate-rise-in inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-600">
      <CheckIcon /> Answer saved
    </div>
  );

  // ── Docked layout: content flows at the top, composer sits at the bottom ─
  if (dock) {
    return (
      // Stretch only while composing — that's what parks the input at the
      // bottom. Once answered, stretching would just wedge empty space between
      // the answers and whatever the host renders below (e.g. the chat thread).
      <div className={`${composing ? "flex-1" : ""} flex flex-col min-h-0`}>
        <div className="space-y-2.5">
          {!composing && answeredCard}
          {recordedPill}
          {!composing && revealBlock}
          {composing && !answered && state?.partner_answered && <BlurredAnswer partnerName={partnerName} />}
        </div>

        {composing && <div className="flex-1" />}

        {/* No safe-area padding here: the tab bar below already absorbs the
            home-indicator inset, so padding for it twice left the input
            hovering above the bar. */}
        {composing && (
          <div className="sticky bottom-0 pt-3 pb-2">
            {editing && (
              <button
                onClick={() => { setEditing(false); setText(state?.your_answer?.text ?? ""); }}
                className="mb-2 text-xs font-semibold text-stone-400 hover:text-rose-500"
              >
                Cancel edit
              </button>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-surface px-2 py-1.5 transition-colors focus-within:border-rose-400 focus-within:ring-4 focus-within:ring-rose-100">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 160) + "px";
                }}
                rows={1}
                placeholder="Add your answer"
                className="flex-1 max-h-40 bg-transparent px-2 py-2 text-[15px] leading-relaxed text-stone-800 outline-none resize-none placeholder:text-stone-400"
              />
              <button
                onClick={submit}
                disabled={!text.trim() || busy}
                aria-label={answered ? "Save answer" : "Submit answer"}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500 text-onaccent disabled:opacity-40 active:scale-90 transition"
              >
                {busy ? <span className="h-4 w-4 rounded-full border-2 border-surface/40 border-t-white animate-spin" /> : <SendIcon />}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Inline layout (packs): compose then answered, stacked in flow ─────
  if (composing) {
    return (
      <div className="mt-3">
        {!answered && state?.partner_answered && <BlurredAnswer partnerName={partnerName} />}
        <div className="rounded-2xl border border-stone-200 bg-surface transition-colors focus-within:border-rose-400 focus-within:ring-4 focus-within:ring-rose-100">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Share your answer…"
            className="w-full bg-transparent px-4 pt-3 pb-1 text-[15px] leading-relaxed text-stone-800 outline-none resize-none placeholder:text-stone-400"
          />
          <div className="px-4 pb-2 text-right text-[11px] text-stone-300">{text.trim().length} characters</div>
        </div>
        <div className="flex gap-3 mt-3">
          {editing && (
            <button
              onClick={() => { setEditing(false); setText(state?.your_answer?.text ?? ""); }}
              className="flex-1 rounded-2xl border border-stone-200 bg-surface py-3 text-stone-500 font-semibold active:scale-[0.98] transition"
            >
              Cancel
            </button>
          )}
          <Button onClick={submit} disabled={!text.trim() || busy} className="flex-1">
            {busy ? "Saving…" : answered ? "Save changes" : "Submit answer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2.5">
      {answeredCard}
      {recordedPill}
      {revealBlock}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

export default function PackExperience({ title, data }: { title: string; data: PackData }) {
  const { me } = useAuth();
  const partner = me?.partner?.display_name;
  const questions = (data.questions ?? []).filter((q) => q.id);
  return (
    <div className="pb-8">
      <h1 className="text-2xl font-bold text-stone-800 leading-snug">{personalize(title, partner)}</h1>
      {data.description && <p className="text-stone-600 mt-2">{data.description}</p>}
      <p className="text-xs text-stone-400 mt-1">{questions.length} questions</p>

      <div className="space-y-4 mt-4">
        {questions.map((q, i) => (
          <Card key={q.id}>
            <div className="flex gap-2">
              <span className="text-rose-400 font-semibold">{i + 1}.</span>
              <div className="flex-1">
                <p className="text-stone-800 font-medium">{personalize(q.question, partner)}</p>
                {q.hint && <p className="text-xs text-stone-400 mt-1 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> {personalize(q.hint, partner)}</p>}
                <AnswerBox contentType="pack" objectId={q.id} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
