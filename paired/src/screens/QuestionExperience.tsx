import { useEffect, useRef, useState } from "react";
import { MessageCircle, Minus, Plus, Send, ShieldCheck } from "lucide-react";
import { messages, type AnswerState, type ChatMessage } from "../api";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { AnswerBox } from "./PackExperience";

/**
 * Standalone-question experience. An accent band carries the prompt and its
 * illustration; the "how this helps" disclosure straddles the band's edge; and
 * the composer docks to the bottom.
 */
export default function QuestionExperience({
  questionId,
  prompt,
  topic,
  evidence,
  image,
}: {
  questionId: string;
  prompt: string;
  topic?: string | null;
  evidence?: string | null;
  image?: string | null;
}) {
  const { me } = useAuth();
  const [state, setState] = useState<AnswerState | null>(null);
  const [showInsight, setShowInsight] = useState(false);

  const revealed = !!state?.revealed;
  const partnerName = me?.partner?.display_name ?? "Your partner";

  return (
    // `flex-1` fills whatever the screen shell leaves over — exactly, unlike
    // a viewport guess at the chrome height, which overshoots and makes every
    // short question page scrollable by the difference.
    <div className="flex flex-1 flex-col">
      {/* Accent band — breaks out of Screen's horizontal padding. */}
      <div className="-mx-4 bg-rose-100 px-4 pt-3 pb-14 relative overflow-hidden">
        <div className="relative z-10 max-w-[62%]">
          {topic && (
            <p className="text-rose-600/70 text-[11px] font-semibold uppercase tracking-[0.12em] mb-2">
              {topic}
            </p>
          )}
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-stone-800">{personalize(prompt, me?.partner?.display_name)}</h1>
        </div>
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden
            className="pointer-events-none select-none absolute right-0 bottom-0 w-36 sm:w-44 object-contain object-bottom"
          />
        )}
      </div>

      {/* Disclosure pill, straddling the band's bottom edge. */}
      {evidence && (
        <div className="relative z-20 -mt-6">
          <button
            onClick={() => setShowInsight((s) => !s)}
            className="w-full flex items-center justify-between gap-3 rounded-full bg-surface border border-rose-100 shadow-md px-5 py-3.5 active:scale-[0.99] transition"
          >
            <span className="text-[15px] font-semibold text-stone-800 text-left">
              How this will help your relationship
            </span>
            {showInsight ? (
              <Minus className="h-5 w-5 shrink-0 text-rose-500" />
            ) : (
              <Plus className="h-5 w-5 shrink-0 text-rose-500" />
            )}
          </button>
          {showInsight && (
            <p className="animate-rise-in mt-3 px-2 text-sm leading-relaxed text-stone-600">{evidence}</p>
          )}
        </div>
      )}

      <p className="mt-4 mb-1 flex items-center justify-center gap-1.5 text-xs text-stone-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Your answers are private.
      </p>

      <AnswerBox dock contentType="question" objectId={questionId} onState={setState} />

      {revealed && <MessageThread contentType="question" objectId={questionId} partnerName={partnerName} />}
    </div>
  );
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** Per-item chat between partners; the backend unlocks it once both have
 *  answered the item. Shared by questions and quiz results. */
export function MessageThread({ contentType, objectId, partnerName }: { contentType: string; objectId: string; partnerName: string }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () =>
    messages
      .list(contentType, objectId)
      .then((r) => setMsgs(r.messages))
      .catch(() => {});

  useEffect(() => {
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), 10000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [contentType, objectId]);

  // Pin the list to its newest message by scrolling the list element itself.
  // scrollIntoView would also drag every scrollable ancestor — i.e. the page —
  // which is exactly the whole-screen jump this chat must not cause. The first
  // fill jumps straight to the bottom; later messages glide.
  const seeded = useRef(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: seeded.current ? "smooth" : "auto" });
    seeded.current = msgs.length > 0;
  }, [msgs.length]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const m = await messages.send(contentType, objectId, text.trim());
      setMsgs((x) => [...x, m]);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 flex-1 flex flex-col">
      <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2 text-sm">
        <MessageCircle className="h-4 w-4 text-stone-400" /> 
        Conversation
      </h3>
      
      {/* The thread scrolls inside this box — a long conversation must not grow
          the page, or reading it scrolls the whole screen. overscroll-contain
          keeps a flick at either end from rubber-banding the page too. */}
      <div
        ref={listRef}
        className="space-y-5 mb-4 min-h-[100px] max-h-[45vh] overflow-y-auto overscroll-y-contain thin-scrollbar"
      >
        {msgs.length === 0 && (
          <div className="text-center py-10 px-4 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
            <p className="text-sm text-stone-500 max-w-xs mx-auto">
              You've both answered. Take a moment to discuss your thoughts below.
            </p>
          </div>
        )}
        
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col w-full ${m.mine ? "items-end" : "items-start"}`}
          >
            {!m.mine && (
              <span className="text-[11px] font-medium text-stone-400 ml-3 mb-1.5 tracking-wide">
                {partnerName}
              </span>
            )}
            {/* Themed tokens only (surface/onaccent/stone/rose) — raw white or
                stone-900 has no Midnight override and reads white-on-white or
                black-on-black there. */}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] border ${
                m.mine
                  ? "bg-rose-600 text-onaccent border-rose-600 rounded-br-md shadow-sm"
                  : "bg-surface text-stone-800 border-stone-200 rounded-bl-md shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
              <span className={`block text-[10px] mt-1.5 text-right ${m.mine ? "text-onaccent/70" : "text-stone-400"}`}>
                {fmtTime(m.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* In normal flow right under the capped list, so list + composer always
          fit on screen together — no sticky needed now that the thread scrolls
          itself instead of stretching the page. */}
      <div className="-mx-4 px-4 border-t border-stone-100 mt-auto">
        <div className="flex items-center gap-2 py-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type a message..."
            className="flex-1 bg-stone-100 border border-transparent focus:bg-surface focus:border-stone-300 focus:ring-2 focus:ring-rose-500/10 rounded-full px-5 py-3 outline-none text-stone-800 text-sm placeholder-stone-400 transition-all"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            aria-label="Send message"
            className="flex items-center justify-center h-11 w-11 shrink-0 rounded-full bg-rose-600 text-onaccent disabled:bg-stone-300 disabled:cursor-not-allowed active:scale-95 transition-all shadow-sm hover:bg-rose-500"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}