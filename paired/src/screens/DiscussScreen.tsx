import { useState } from "react";
import { activity, type Activity } from "../api";
import { keys, useQuery } from "../query";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { ArrowRight, Bookmark, Check, ChevronRight, ClipboardList, Dices, Lightbulb, MessageCircle, Package, type LucideIcon } from "lucide-react";
import { Card, Screen, Spinner } from "../ui";
import { useBootRoute, useScreenEntry } from "../router";
import { DetailView, SavedView } from "./ExploreScreen";

const TYPE_ICON: Record<string, LucideIcon> = {
  question: MessageCircle,
  quiz: ClipboardList,
  game: Dices,
  tip: Lightbulb,
  pack: Package,
};

type Seg = "your_turn" | "partner_turn" | "all";

export default function DiscussScreen() {
  const { me } = useAuth();
  const [seg, setSeg] = useState<Seg>("all");
  const [open, setOpen] = useState<{ collection: string; id: string } | null>(null);
  // A /saved link opens straight onto the bookmarks (browser tabs only).
  const [showSaved, setShowSaved] = useState(!!useBootRoute()?.saved);
  useScreenEntry(showSaved, "/saved", () => setShowSaved(false));

  // Whose turn it is flips the moment the partner answers. useQuery revalidates
  // this on every foreground, which is what the old visibilitychange listener
  // here did by hand.
  const { data, loading, refetch } = useQuery(keys.activity, activity);
  useScreenEntry(!!open, open ? `/${open.collection}/${open.id}` : undefined, () => {
    setOpen(null);
    refetch(); // same as the in-app back: the turn may have flipped
  });
  const items = data?.items ?? [];
  const partnerName = data?.partner_name ?? null;

  if (open) return <DetailView collection={open.collection} id={open.id} onBack={() => { setOpen(null); refetch(); }} />;
  if (showSaved) return <SavedView onBack={() => setShowSaved(false)} />;

  if (!me?.paired) {
    return (
      <Screen header={<DiscussHeader onSaved={() => setShowSaved(true)} />}>
        <p className="text-stone-500 text-center mt-10">Pair with your partner to see what you've each been up to.</p>
      </Screen>
    );
  }

  const partner = partnerName ?? "Partner";
  const yourTurn = items.filter((i) => i.state === "your_turn");
  const partnerTurn = items.filter((i) => i.state === "partner_turn");
  const shown = seg === "your_turn" ? yourTurn : seg === "partner_turn" ? partnerTurn : items;

  const tabs: { key: Seg; label: string; badge: number }[] = [
    { key: "all", label: "All", badge: items.length },
    { key: "your_turn", label: "Your turn", badge: yourTurn.length },
    { key: "partner_turn", label: `${partner}'s turn`, badge: partnerTurn.length },
  ];

  return (
    <Screen
      header={
        <>
          <DiscussHeader onSaved={() => setShowSaved(true)} />
          {/* Horizontal segmented tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setSeg(t.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  seg === t.key ? "bg-rose-500 text-onaccent" : "bg-surface border border-stone-200 text-stone-500"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 ${seg === t.key ? "text-onaccent/80" : "text-stone-400"}`}>{t.badge}</span>
              </button>
            ))}
          </div>
        </>
      }
    >
      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState seg={seg} partner={partner} />
      ) : (
        <div className="space-y-2 pb-6">
          {shown.map((it) => {
            const Icon = TYPE_ICON[it.content_type] ?? MessageCircle;
            return (
              <button key={`${it.content_type}-${it.object_id}`} onClick={() => setOpen({ collection: it.link_collection, id: it.link_id })} className="w-full text-left">
                <Card className="flex items-center gap-3 p-4 active:scale-[0.99] transition">
                  <Icon className="h-6 w-6 text-rose-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 leading-snug line-clamp-2">{it.title ? personalize(it.title, partnerName) : "Activity"}</div>
                    <div className="text-xs mt-1">
                      <StatusPill state={it.state} partner={partner} />
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-stone-300 shrink-0" />
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

function DiscussHeader({ onSaved }: { onSaved: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2 pb-4">
      <h1 className="text-2xl font-bold text-stone-800">Discuss</h1>
      <button
        onClick={onSaved}
        className="flex items-center gap-1.5 rounded-full bg-surface border border-rose-200 text-rose-600 text-sm font-semibold px-4 py-2 active:scale-95 transition"
      >
        <Bookmark className="h-4 w-4" /> Saved
      </button>
    </div>
  );
}

function StatusPill({ state, partner }: { state: Activity["state"]; partner: string }) {
  if (state === "your_turn") return <span className="text-rose-600 font-semibold inline-flex items-center gap-1">Your turn <ArrowRight className="h-3.5 w-3.5" /></span>;
  if (state === "partner_turn") return <span className="text-amber-600 font-semibold">Waiting on {partner}</span>;
  return <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">You both answered <Check className="h-3.5 w-3.5" /></span>;
}

function EmptyState({ seg, partner }: { seg: Seg; partner: string }) {
  const msg =
    seg === "your_turn"
      ? `Nothing waiting on you right now. When ${partner} answers something, it'll show up here.`
      : seg === "partner_turn"
      ? `Nothing pending on ${partner}. Answer something new and it'll appear here.`
      : "No activity yet. Answer a question, quiz or game to get started!";
  return <p className="text-stone-400 text-center mt-10 px-6">{msg}</p>;
}
