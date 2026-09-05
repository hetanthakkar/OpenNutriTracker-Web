import { useEffect, useRef, useState } from "react";
// The food & movement diary is switched off in the UI (see DiaryCard below).
// `diary` / `DiaryEntry` are still exported from ../api and the endpoints still
// serve — add them back to this import to bring the feature back.
import { ApiError, bookmarks, categories, content, daily, shuffleDaily, type Category, type JourneyProgress, type MainImage } from "../api";
import { contentKey, invalidate, keys, useQuery } from "../query";
import type { Target as NavTarget } from "../navigation";
import { useBootRoute, useScreenEntry } from "../router";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { Avatar, Button, Card, HostBar, NudgeButton, Screen, Spinner } from "../ui";
import {
  Bird, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Dices, Flame,
  HeartHandshake, Home, Hourglass, Lightbulb, Map, MessageCircle, MessageCircleQuestion,
  Package, PartyPopper, Rainbow, Search, Shuffle, Sparkles, Sprout, ClipboardList, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import QuizExperience, { type QuizData } from "./QuizExperience";
import PackExperience from "./PackExperience";
import GameExperience, { type GameData } from "./GameExperience";
import QuestionExperience from "./QuestionExperience";
import JourneyExperience, { type JourneyData } from "./JourneyExperience";
import { asExercise, PartnerExercise, TipBody } from "./TipContent";

// import DiaryScreen from "./DiaryScreen";
import NotificationsScreen, { NotificationBell } from "./NotificationsScreen";

// content_type (singular, used by the API) <-> collection (plural, used in routes)
const SINGULAR: Record<string, string> = {
  questions: "question", packs: "pack", journeys: "journey", quizzes: "quiz", games: "game", tips: "tip",
};
const PLURAL: Record<string, string> = Object.fromEntries(
  Object.entries(SINGULAR).map(([plural, singular]) => [singular, plural])
);

interface Item {
  id: string;
  title?: string | null;
  name?: string | null;
  question?: string | null;
  description?: string | null;
  topic?: string | null;
  author?: string | null;
  type?: string | null;
  /** Thumbnail. Packs and tips carry no illustration, so it's absent there. */
  image?: string | null;
  total_questions?: number | null;
  number_of_questions?: number | null;
  /** Absent on journeys, which can't be answered. */
  you_answered?: boolean;
  partner_answered?: boolean;
  /** Journeys only: length, and the caller's run of it (if any). */
  total_days?: number | null;
  progress?: JourneyProgress | null;
  data?: unknown;
}

/**
 * Tile colours, written as literal class strings — Tailwind can't see
 * interpolated names like `bg-${tone}-50`, so those would never be generated.
 * Every scale used here is also themed for Midnight in index.css.
 */
const TONES = {
  rose: "bg-rose-50 border-rose-100 text-rose-600",
  indigo: "bg-indigo-50 border-indigo-100 text-indigo-600",
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-600",
  violet: "bg-violet-50 border-violet-100 text-violet-600",
  amber: "bg-amber-50 border-amber-100 text-amber-600",
  sky: "bg-sky-50 border-sky-100 text-sky-600",
} as const;

const COLLECTIONS: {
  key: string;
  label: string;
  Icon: LucideIcon;
  tag: string;
  tone: keyof typeof TONES;
}[] = [
    { key: "questions", label: "Questions", Icon: MessageCircleQuestion, tag: "1,447", tone: "rose" },
    { key: "games", label: "Games", Icon: Dices, tag: "484", tone: "amber" },
    { key: "quizzes", label: "Quizzes", Icon: ClipboardList, tag: "528", tone: "violet" },
    { key: "packs", label: "Packs", Icon: Package, tag: "221", tone: "indigo" },
    { key: "journeys", label: "Journeys", Icon: Map, tag: "16", tone: "emerald" },
    { key: "tips", label: "Tips", Icon: Lightbulb, tag: "257", tone: "sky" },
  ];

const titleOf = (it: Item) => it.title || it.name || it.question || "Untitled";

/** The extra fields a question carries in its `data` payload. */
interface QuestionData {
  evidence?: string;
  hint?: string;
  mainImage?: MainImage;
  /** `question` with a `%{partnerName}` placeholder instead of baked-in text. */
  invariantQuestion?: string;
}
const questionData = (it: Item): QuestionData => (it.data ?? {}) as QuestionData;

/** Home tab — today's question and the six content collections. */
export function MainScreen({ pending }: { pending?: { nonce: number; target: NavTarget } | null }) {
  const { me } = useAuth();
  // A shared/reloaded URL opens straight onto what it names (browser tabs
  // only — boot is null installed). An item with a day rides in via `nudged`,
  // which is the state that already knows how to open a journey on a day.
  const boot = useBootRoute();
  const bootDay = !!(boot?.id && boot.day);
  const [collection, setCollection] = useState<string | null>(bootDay ? null : boot?.collection ?? null);
  const [detailId, setDetailId] = useState<string | null>(bootDay ? null : boot?.id ?? null);
  const [dailyId, setDailyId] = useState<string | null>(null);
  // const [diaryOpen, setDiaryOpen] = useState(false);
  const [notifications, setNotifications] = useState(!!boot?.notifications);
  // An item opened *from* the inbox. Kept apart from `detailId` so backing out
  // returns to the list of nudges the user came from, not to Home.
  const [nudged, setNudged] = useState<{ collection: string; id: string; day?: number } | null>(
    bootDay ? { collection: boot!.collection!, id: boot!.id!, day: boot!.day } : null,
  );

  // Each open screen holds one history entry (browser back closes it), declared
  // in stacking order for the one render that opens two at once (a deep link).
  useScreenEntry(!!collection, `/${collection}`, () => setCollection(null));
  useScreenEntry(!!(collection && detailId), `/${collection}/${detailId}`, () => setDetailId(null));
  useScreenEntry(!!dailyId, `/quizzes/${dailyId}`, () => setDailyId(null));
  // useScreenEntry(diaryOpen, "/diary", () => setDiaryOpen(false));
  useScreenEntry(notifications, "/notifications", () => setNotifications(false));
  useScreenEntry(!!nudged, nudged ? `/${nudged.collection}/${nudged.id}` : undefined, () => setNudged(null));

  // A tapped notification asked for a Home destination (App bumps the nonce on
  // every tap, so re-opening the same nudge works). Whatever the user had open
  // gives way to it — they asked to be here.
  const nonce = pending?.nonce;
  const target = pending?.target;
  useEffect(() => {
    if (!target) return;
    setCollection(null);
    setDetailId(null);
    setDailyId(null);
    if (target.screen === "item") {
      // Straight to the thing they were nudged about, inbox skipped.
      setNotifications(false);
      setNudged({
        collection: PLURAL[target.contentType] ?? target.contentType,
        id: target.objectId,
        day: target.day,
      });
    } else if (target.screen === "notifications") {
      setNudged(null);
      setNotifications(true);
    } else {
      setNudged(null);
      setNotifications(false);
    }
    // `nonce` is the real trigger — the same target tapped twice must re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // Ordered so the deepest thing the user opened wins.
  if (nudged)
    return (
      <DetailView
        key={`${nudged.collection}:${nudged.id}:${nudged.day ?? ""}`}
        collection={nudged.collection}
        id={nudged.id}
        openDay={nudged.day}
        onBack={() => setNudged(null)}
      />
    );
  if (notifications)
    return (
      <NotificationsScreen
        onBack={() => setNotifications(false)}
        onOpen={(target) =>
          setNudged({
            collection: PLURAL[target.content_type] ?? target.content_type,
            id: target.object_id,
            day: target.day ?? undefined,
          })
        }
      />
    );
  // if (diaryOpen) return <DiaryScreen onBack={() => setDiaryOpen(false)} />;
  if (dailyId)
    return <DetailView collection="quizzes" id={dailyId} onBack={() => setDailyId(null)} />;
  if (collection && detailId)
    return <DetailView collection={collection} id={detailId} onBack={() => setDetailId(null)} />;
  if (collection)
    return <ListView collection={collection} onOpen={setDetailId} onBack={() => setCollection(null)} />;

  return (
    <Screen>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="pt-3 pb-4 flex items-center gap-3 animate-fade-up">
        <h1 className="min-w-0 flex-1 truncate text-2xl text-stone-800">
          <span className="font-normal text-stone-400">Welcome back, </span>
          <span className="font-bold">{me?.display_name || "there"}</span>
        </h1>
        <NotificationBell onOpen={() => setNotifications(true)} />
      </header>

      {/* ── Daily hero ────────────────────────────────────────────────── */}
      <div className="animate-fade-up delay-1">
        <DailyHero onOpen={setDailyId} />
      </div>

      {/* ── Section divider ───────────────────────────────────────────── */}
      <div className="mt-7 mb-3.5 flex items-center gap-3 animate-fade-up delay-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Explore</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-stone-200 to-transparent" />
      </div>

      {/* ── Uniform grid — all tiles equal ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-6">
        {COLLECTIONS.map((c, i) => (
          <button
            key={c.key}
            onClick={() => setCollection(c.key)}
            className={`animate-fade-up delay-${Math.min(i + 2, 5)} group relative overflow-hidden rounded-2xl border p-3.5 text-left flex flex-col transition-all duration-200 active:scale-[0.96] hover:shadow-md ${TONES[c.tone]}`}
          >
            {/* Decorative watermark icon */}
            <c.Icon
              className="pointer-events-none absolute -bottom-2 -right-2 h-16 w-16 opacity-[0.06] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
              strokeWidth={1}
            />

            {/* Icon */}
            <span className="relative z-10 mb-2.5 grid h-10 w-10 place-items-center rounded-xl bg-surface/40 backdrop-blur-sm shadow-sm">
              <c.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>

            {/* Text */}
            <div className="relative z-10 mt-auto">
              <div className="text-[13px] font-bold leading-tight text-stone-800">{c.label}</div>
              <div className="mt-0.5 text-[11px] font-semibold tabular-nums opacity-70">{c.tag}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Shared food & movement diary ───────────────────────────────── */}
      {/* <div className="mt-7 pb-6 animate-fade-up delay-5">
        <DiaryCard onOpen={() => setDiaryOpen(true)} />
      </div> */}

      </Screen>
  );
}

/** Home entry point for the diary: today's net calories at a glance, tap for the
 *  full day. Nets are calories eaten minus calories burned, per partner.
 *
 *  Switched off — the whole food/movement/calorie feature is hidden from the UI.
 *  Uncomment this, the block that renders it above, the `diaryOpen` state, its
 *  `useScreenEntry`, the early return, and the two ../api imports to restore it.
 *  DiaryScreen.tsx itself is untouched and still compiles.
 */
/*
function DiaryCard({ onOpen }: { onOpen: () => void }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const { data } = useQuery(keys.diary(today), () => diary.day(today));
  const entries = data?.entries ?? [];
  const net = (mine: boolean) =>
    entries
      .filter((e: DiaryEntry) => e.mine === mine)
      .reduce((n, e) => n + (e.kind === "food" ? e.calories : -e.calories), 0);
  const partnerName = data?.partner_name;
  const logged = entries.length > 0;

  return (
    <>
      <div className="mb-3.5 flex items-center gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Food & movement</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-stone-200 to-transparent" />
      </div>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-4 rounded-3xl border border-rose-100 bg-rose-50 p-5 text-left transition active:scale-[0.99]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface/60 text-rose-500 shadow-sm">
          <Flame className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          {logged ? (
            <>
              <div className="text-[15px] font-bold text-stone-800">
                <span className="tabular-nums">{net(true).toLocaleString()}</span>{" "}
                <span className="font-semibold text-stone-500">kcal net today</span>
              </div>
              {partnerName && (
                <div className="mt-0.5 truncate text-xs font-medium text-stone-400">
                  {partnerName}: <span className="tabular-nums">{net(false).toLocaleString()}</span> kcal
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[15px] font-bold text-stone-800">Track today together</div>
              <div className="mt-0.5 text-xs font-medium text-stone-400">Log what you ate and your movement.</div>
            </>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />
      </button>
    </>
  );
}
*/

/**
 * Today's shared quiz — five tap-to-rate statements, which is a far lighter ask
 * than a blank text box, so a couple actually finishes it. `/api/daily/` 409s
 * until the user pairs, so an unpaired user gets an invitation to pair rather
 * than an error.
 */
function DailyHero({ onOpen }: { onOpen: (id: string) => void }) {
  const { me } = useAuth();
  const { data: day, loading, error, set: setDay } = useQuery(keys.daily, daily);
  const [shuffling, setShuffling] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);

  const phase: "loading" | "ready" | "unpaired" | "empty" = loading
    ? "loading"
    : day
      ? "ready"
      : error instanceof ApiError && error.status === 409
        ? "unpaired"
        : "empty";

  async function onShuffle() {
    setShuffling(true);
    setShuffleError(null);
    try {
      setDay(await shuffleDaily());
    } catch (e) {
      // A 409 means the partner answered between render and tap — the server
      // is the arbiter, so surface its message and refresh to their question.
      setShuffleError(e instanceof ApiError ? e.message : "Couldn't shuffle — try again.");
      if (e instanceof ApiError && e.status === 409) daily().then(setDay).catch(() => {});
    } finally {
      setShuffling(false);
    }
  }

  if (phase === "loading")
    return <div className="h-52 animate-pulse rounded-3xl border border-rose-100 bg-rose-50 shadow-sm" />;

  if (phase === "unpaired")
    return (
      <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100 p-6 text-center shadow-sm">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-rose-200/30 blur-2xl" />
        <HeartHandshake className="relative mx-auto mb-3 h-11 w-11 text-rose-500" strokeWidth={1.5} />
        <p className="relative font-bold text-stone-800">Your daily quiz awaits</p>
        <p className="relative mt-1 text-sm text-stone-500">Pair with your partner from the Us tab to unlock it.</p>
      </div>
    );

  if (phase === "empty" || !day) return null;

  const quiz = day.quiz;
  const image = (quiz.data as { mainImage?: MainImage } | undefined)?.mainImage?.url;
  const partnerName = me?.partner?.display_name ?? "Your partner";
  // Once either partner has answered, the quiz is locked in for the day.
  const canShuffle = !day.you_answered && !day.partner_answered;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100/80 px-5 pb-5 pt-5 shadow-sm">
      {/* Decorative radial glow */}
      <div className="pointer-events-none absolute -top-8 -left-8 h-36 w-36 rounded-full bg-rose-200/25 blur-2xl" />

      {canShuffle && (
        <button
          onClick={onShuffle}
          disabled={shuffling}
          aria-label="Shuffle today's quiz"
          className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-surface/80 text-rose-600 shadow-sm backdrop-blur-sm transition active:scale-90 disabled:opacity-60"
        >
          <Shuffle className={`h-4 w-4 ${shuffling ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      )}

      {/* Right gutter keeps the copy and CTA clear of the illustration. */}
      <div className={`relative z-10 ${image ? "pr-28 sm:pr-32" : ""}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-onaccent shadow-sm">
          Quiz of the day
        </span>
        <p className="mt-3 text-[22px] font-extrabold leading-tight text-stone-800">
          {personalize(quiz.title, me?.partner?.display_name)}
        </p>
        {/* The promise that makes it feel doable: no typing, and it's over in a
            handful of taps. */}
        <p className="mt-1.5 text-sm font-medium text-stone-500">
          {quiz.question_count ? `${quiz.question_count} quick taps` : "A few quick taps"}
          {quiz.topic ? ` · ${quiz.topic}` : ""}
        </p>
        {shuffleError && <p className="mt-2 text-xs font-medium text-rose-600">{shuffleError}</p>}

        <div className="mt-4">
          {!day.you_answered ? (
            <Button className="max-w-xs shadow-md" onClick={() => onOpen(quiz.id)}>
              Take the quiz
            </Button>
          ) : day.revealed ? (
            <button
              onClick={() => onOpen(quiz.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 transition"
            >
              <Check className="h-4 w-4" /> You both answered — compare
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500">
                <Hourglass className="h-4 w-4" /> Waiting for {partnerName}
              </span>
              <NudgeButton kind="quiz" context={{ quiz_id: quiz.id }} className="text-xs px-3 py-1.5" />
            </div>
          )}
        </div>
      </div>
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 w-32 select-none object-contain object-bottom sm:w-36 drop-shadow-sm"
        />
      )}
    </div>
  );
}

/** Topics tab — questions, quizzes and games grouped by area (theme).
 *  Named "Activities" until the swipe deck took that name; the `activities`
 *  tab key and /activities/<name> URLs are unchanged, so shared links live. */
export function ActivitiesScreen() {
  const [category, setCategory] = useState<Category | null>(null);
  useScreenEntry(
    !!category,
    category ? `/activities/${encodeURIComponent(category.name)}` : undefined,
    () => setCategory(null),
  );

  // An /activities/<name> link names a category we can only open once the
  // categories arrive (CategoryView needs the row, not just the name). Same
  // cache key as CategoriesList below, so this costs no extra request. The ref
  // is consumed on the first look so a later refetch can't re-open a category
  // the user has since backed out of.
  const wanted = useRef(useBootRoute()?.category ?? null);
  const { data: cats } = useQuery(wanted.current ? keys.categories : null, categories);
  useEffect(() => {
    if (!wanted.current || !cats) return;
    const hit = cats.find((c) => c.name === wanted.current);
    wanted.current = null;
    if (hit) setCategory(hit);
  }, [cats]);

  if (category) return <CategoryView category={category} onBack={() => setCategory(null)} />;
  return (
    <Screen
      header={
        <div className="pt-2 pb-4">
          <h1 className="text-2xl font-bold text-stone-800">Topics</h1>
          <p className="text-sm text-stone-400 mt-1">Questions, quizzes & games grouped by area.</p>
        </div>
      }
    >
      <CategoriesList onPick={setCategory} />
    </Screen>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Connection: HeartHandshake,
  "Meaning & Growth": Sprout,
  "Fun & Excitement": PartyPopper,
  "Sex & Intimacy": Flame,
  Communication: MessageCircle,
  General: Sparkles,
  "Home & Work": Home,
  Conflict: Bird,
  "Family & Friends": Users,
  "Money & Finances": Wallet,
  "LGBTQ+": Rainbow,
};
const catIcon = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Compass;

function CategoriesList({ onPick }: { onPick: (c: Category) => void }) {
  const { data, loading } = useQuery(keys.categories, categories);
  const cats = data ?? [];
  if (loading) return <Spinner />;
  if (cats.length === 0) return <p className="text-stone-400 text-center mt-10">No activities yet.</p>;
  return (
    <div className="space-y-2 pb-6">
      {cats.map((c) => (
        <CategoryRow key={c.name} category={c} onPick={onPick} />
      ))}
    </div>
  );
}

function CategoryRow({ category: c, onPick }: { category: Category; onPick: (c: Category) => void }) {
  const Icon = catIcon(c.name);
  return (
    <button onClick={() => onPick(c)} className="w-full text-left">
      <Card className="flex items-center justify-between gap-3 p-4 active:scale-[0.99] transition">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 text-rose-500 shrink-0" />
          <div>
            <div className="font-semibold text-stone-800 leading-tight">{c.name}</div>
            <div className="text-xs text-stone-400 mt-0.5">{c.quizzes} quizzes · {c.games} games · {c.questions} questions</div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-stone-300 shrink-0" />
      </Card>
    </button>
  );
}

/**
 * Rows an expanded section previews before deferring to "See all". Kept at 3 so
 * the open accordion plus the two collapsed headers below it clear the fold on
 * a phone: header 56 + 3×76 + "See all" 40 + two headers/gaps 136 ≈ 460px.
 */
const PREVIEW = 3;

const CATEGORY_SECTIONS = [
  { collection: "quizzes", label: "Quizzes", Icon: ClipboardList, of: (c: Category) => c.quizzes },
  { collection: "games", label: "Games", Icon: Dices, of: (c: Category) => c.games },
  { collection: "questions", label: "Questions", Icon: MessageCircleQuestion, of: (c: Category) => c.questions },
] as const;

function CategoryView({ category, onBack }: { category: Category; onBack: () => void }) {
  const [open, setOpen] = useState<{ collection: string; id: string } | null>(null);
  const [seeAll, setSeeAll] = useState<string | null>(null);
  const name = category.name;
  // "See all" keeps the category's URL — its own back step, same place.
  useScreenEntry(!!seeAll, `/activities/${encodeURIComponent(name)}`, () => setSeeAll(null));
  useScreenEntry(!!open, open ? `/${open.collection}/${open.id}` : undefined, () => setOpen(null));
  const CatIcon = catIcon(name);
  const leadSection = CATEGORY_SECTIONS.find((s) => s.of(category) > 0)?.collection;

  if (open)
    return <DetailView collection={open.collection} id={open.id} onBack={() => setOpen(null)} />;
  if (seeAll)
    return (
      <ListView
        collection={seeAll}
        topic={name}
        onOpen={(id) => setOpen({ collection: seeAll, id })}
        onBack={() => setSeeAll(null)}
      />
    );

  return (
    <Screen
      header={
        <div className="pt-2 pb-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="text-rose-600"><ChevronLeft className="h-6 w-6" /></button>
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2"><CatIcon className="h-5 w-5 text-rose-500" /> {name}</h1>
        </div>
      }
    >
      <div className="space-y-3 pb-6">
        {CATEGORY_SECTIONS.map((s) => (
          <CategorySection
            key={s.collection}
            collection={s.collection}
            label={s.label}
            Icon={s.Icon}
            topic={name}
            count={s.of(category)}
            // Lead with one section already open so the screen isn't three bare
            // headers; the rest sit collapsed just below it. Empty sections
            // render nothing, so anchor on the first one that has items.
            defaultOpen={s.collection === leadSection}
            onOpen={(id) => setOpen({ collection: s.collection, id })}
            onSeeAll={() => setSeeAll(s.collection)}
          />
        ))}
      </div>
    </Screen>
  );
}

/**
 * Collapsible accordion per content type. Expanding previews only the first
 * few items — the full list lives behind "See all", so a category with hundreds
 * of items can't flood the screen.
 */
function CategorySection({
  collection,
  label,
  Icon,
  topic,
  count,
  onOpen,
  onSeeAll,
  defaultOpen = false,
}: {
  collection: string;
  label: string;
  Icon: LucideIcon;
  topic: string;
  count: number;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  /** Starts expanded, so a category never opens as three bare headers. */
  defaultOpen?: boolean;
}) {
  const { me } = useAuth();
  const [expanded, setExpanded] = useState(defaultOpen);

  // Held off until first expand. The key matches the one CollectionList builds
  // for page 1 of the same topic, so opening "See all" reuses these rows.
  const { data, loading } = useQuery(expanded ? contentKey(collection, { topic, page: 1 }) : null, () =>
    content.list<Item>(collection, { topic, page: 1 }),
  );
  const items = (data?.results ?? []).slice(0, PREVIEW);

  if (count === 0) return null;
  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 rounded-2xl border border-rose-50 bg-surface p-3.5 text-left shadow-sm transition active:scale-[0.99]"
      >
        <Icon className="h-5 w-5 shrink-0 text-rose-500" />
        <span className="font-semibold text-stone-800">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-stone-400">{count}</span>
        <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {loading && Array.from({ length: PREVIEW }, (_, i) => <RowSkeleton key={i} compact />)}
          {items.map((it) => (
            <ListRow
              key={it.id}
              item={it}
              Icon={Icon}
              compact
              onOpen={() => onOpen(it.id)}
              youName={me?.display_name ?? "You"}
              partnerName={me?.partner?.display_name ?? null}
            />
          ))}
          {!loading && count > items.length && (
            <button onClick={onSeeAll} className="flex w-full items-center justify-center gap-1 py-2 text-sm font-semibold text-rose-600">
              See all {count} <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SavedView({ onBack }: { onBack: () => void }) {
  const { me } = useAuth();
  const [open, setOpen] = useState<{ collection: string; id: string } | null>(null);
  useScreenEntry(!!open, open ? `/${open.collection}/${open.id}` : undefined, () => setOpen(null));
  const { data, loading } = useQuery(keys.bookmarks, () => bookmarks.list());
  const items = data ?? [];

  if (open) return <DetailView collection={open.collection} id={open.id} onBack={() => setOpen(null)} />;

  return (
    <Screen
      header={
        <div className="pt-2 pb-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="text-rose-600"><ChevronLeft className="h-6 w-6" /></button>
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2"><Bookmark className="h-5 w-5 text-rose-500" /> Saved</h1>
        </div>
      }
    >
      {loading ? <Spinner /> : items.length === 0 ? (
        <p className="text-stone-400 text-center mt-10">No saved items yet. Tap the bookmark icon on anything to save it.</p>
      ) : (
        <div className="space-y-2 pb-6">
          {items.map((it) => (
            <button key={`${it.content_type}-${it.object_id}`} onClick={() => setOpen({ collection: PLURAL[it.content_type], id: it.object_id })} className="w-full text-left">
              <Card className="active:scale-[0.99] transition p-4">
                <div className="font-medium text-stone-800 leading-snug">{it.title ? personalize(it.title, me?.partner?.display_name) : "Untitled"}</div>
                <div className="text-xs text-stone-400 mt-1 capitalize">{it.content_type}</div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}

// Two tabs, not three: an "All" tab would mostly be tapped to find something
// not yet explored, which is exactly the Unanswered tab — so that's the default.
const ANSWER_FILTERS = [
  { key: "unanswered", label: "Unanswered" },
  { key: "answered", label: "Answered" },
] as const;
type AnswerFilter = (typeof ANSWER_FILTERS)[number]["key"];

// Collections whose items can be answered — journeys can't, so they get no tabs.
const ANSWERABLE = new Set(["questions", "packs", "quizzes", "games", "tips"]);

// Per-collection count a category row carries, for the topic filter chips.
// Absent (packs, journeys) => the collection has no topic column, no chips.
const TOPIC_COUNTS: Record<string, (c: Category) => number> = {
  questions: (c) => c.questions,
  quizzes: (c) => c.quizzes,
  games: (c) => c.games,
  tips: (c) => c.tips,
};

// Raw game `type` values, humanised for the row badge.
const TYPE_LABELS: Record<string, string> = {
  PartnerKnowledge: "Partner knowledge",
  YouOrMe: "You or Me",
};

/**
 * Who in the couple has already done this item. Renders nothing when neither
 * has, so an untouched list stays quiet. Overlapping avatars are ringed in the
 * surface color to read as a stack.
 */
function AnsweredBy({ item, youName, partnerName }: { item: Item; youName: string; partnerName: string | null }) {
  const you = !!item.you_answered;
  const partner = !!item.partner_answered && !!partnerName;
  if (!you && !partner) return null;

  const label = you && partner ? "You both answered" : you ? "You answered" : `${partnerName} answered`;
  return (
    <span className="flex shrink-0 -space-x-1.5" title={label} aria-label={label}>
      {you && <Avatar name={youName} tone="rose" className="ring-2 ring-surface" />}
      {partner && <Avatar name={partnerName!} tone="indigo" className="ring-2 ring-surface" />}
    </span>
  );
}

/**
 * One row in a collection list: thumbnail (or the collection's icon as a
 * fallback), title, and a meta line of badge + whatever that collection carries.
 * `type` is only worth badging on games — elsewhere every row shares one value.
 */
function ListRow({
  item,
  Icon,
  onOpen,
  youName,
  partnerName,
  compact = false,
}: {
  item: Item;
  Icon: LucideIcon;
  onOpen: () => void;
  youName: string;
  partnerName: string | null;
  /** Half-height row (no meta line) so an accordion preview stays above the fold. */
  compact?: boolean;
}) {
  const badge = item.type ? TYPE_LABELS[item.type] : null;
  const count = item.total_questions ?? item.number_of_questions;
  const meta = [
    count ? `${count} questions` : null,
    item.total_days ? `${item.total_days} days` : null,
    item.topic,
    item.author,
  ].filter(Boolean).join(" · ");
  // A journey the couple is on (or finished) says so in place of a type badge.
  const progress = item.progress
    ? item.progress.completed
      ? { label: "Completed", cls: "bg-emerald-50 text-emerald-600" }
      : { label: `Day ${item.progress.your_day}/${item.progress.total_days}`, cls: "bg-rose-50 text-rose-600" }
    : null;
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 border border-rose-50 bg-surface text-left shadow-sm transition active:scale-[0.99] ${
        compact ? "rounded-2xl p-2.5" : "rounded-3xl p-3"
      }`}
    >
      <span
        className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-rose-50 ${
          compact ? "h-12 w-12" : "h-16 w-16"
        }`}
      >
        {item.image ? (
          <img src={item.image} alt="" aria-hidden loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <Icon className={compact ? "h-5 w-5 text-rose-400" : "h-6 w-6 text-rose-400"} strokeWidth={1.75} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block font-semibold leading-snug text-stone-800 ${
            compact ? "line-clamp-2 text-sm" : "line-clamp-2"
          }`}
        >
          {personalize(titleOf(item), partnerName)}
        </span>

        {!compact && (badge || progress || meta) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {progress && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${progress.cls}`}>
                {progress.label}
              </span>
            )}
            {badge && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-600">
                {badge}
              </span>
            )}
            {meta && <span className="text-xs text-stone-400">{meta}</span>}
          </span>
        )}
      </span>

      <AnsweredBy item={item} youName={youName} partnerName={partnerName} />
      <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />
    </button>
  );
}

/** Placeholder rows so the list doesn't collapse to a spinner between pages. */
function RowSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 border border-rose-50 bg-surface shadow-sm ${
        compact ? "rounded-2xl p-2.5" : "rounded-3xl p-3"
      }`}
    >
      <div
        className={`shrink-0 animate-pulse rounded-2xl bg-stone-100 ${compact ? "h-12 w-12" : "h-16 w-16"}`}
      />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-stone-100" />
        {!compact && <div className="h-3 w-2/5 animate-pulse rounded-full bg-stone-100" />}
      </div>
    </div>
  );
}

/** One pill in a horizontally scrolling filter row. Tapping an active chip clears it. */
function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
        active ? "bg-rose-500 text-onaccent" : "border border-stone-200 bg-surface text-stone-500"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="px-6 pt-14 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-400">
        <Icon className="h-7 w-7" />
      </span>
      <p className="mt-4 font-bold text-stone-800">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-stone-500">{sub}</p>
    </div>
  );
}

function ListView({
  collection,
  onOpen,
  onBack,
  topic,
}: {
  collection: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  /** Scopes the list to one category, for "See all" out of a CategorySection. */
  topic?: string;
}) {
  const { me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AnswerFilter>("unanswered");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const meta = COLLECTIONS.find((c) => c.key === collection)!;
  // The answered/unanswered split is per-user, so only offer it once signed in.
  const showTabs = ANSWERABLE.has(collection) && !!me;
  const answered = showTabs ? (filter === "answered" ? ("true" as const) : ("false" as const)) : undefined;

  // Topic chips, unless the caller already scoped the list to one category.
  // Only games carry a second axis (type), so they get an extra chip row.
  const countOf = TOPIC_COUNTS[collection];
  const showTopics = !!countOf && !topic;
  const { data: cats } = useQuery(showTopics ? keys.categories : null, categories);
  const topics = showTopics ? (cats ?? []).filter((c) => countOf(c) > 0).map((c) => c.name) : [];
  const showTypes = collection === "games";
  const hasChipFilter = !!topicFilter || !!typeFilter;

  // Typing must not fire a request per keystroke, so the query key only moves
  // once the search box settles. Clearing it is instant — the rows are cached.
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const params: { page: number; search: string; answered?: "true" | "false"; topic?: string; type?: string } = {
    page,
    search: debounced,
    answered,
    topic: topic ?? topicFilter ?? undefined,
    type: typeFilter ?? undefined,
  };
  const { data, loading: querying } = useQuery(contentKey(collection, params), () =>
    content.list<Item>(collection, params),
  );
  const items = data?.results ?? [];
  const count = data?.count ?? 0;
  // Keep the skeleton up through the debounce gap, or the old rows would sit
  // there looking settled while the user is still typing a new search.
  const loading = querying || debounced !== search;

  const lower = meta.label.toLowerCase();
  return (
    <Screen
      // Header + search + filters travel together, pinned above the scroll.
      header={
        <div className="pb-3 pt-2">
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="Back" className="-ml-1 text-stone-400 transition active:scale-90">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold text-stone-800">
              <meta.Icon className="h-5 w-5 shrink-0 text-rose-500" />
              <span className="truncate">{meta.label}</span>
              {topic && <span className="truncate text-sm font-normal text-stone-400">· {topic}</span>}
            </h1>
            {!loading && <span className="ml-auto text-xs font-semibold tabular-nums text-stone-400">{count}</span>}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              placeholder={`Search ${lower}…`}
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              className="w-full rounded-2xl border border-stone-200 bg-surface py-3 pl-10 pr-10 text-stone-800 outline-none focus:border-rose-400"
            />
            {search && (
              <button
                onClick={() => { setPage(1); setSearch(""); }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-stone-400 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {showTabs && (
            <div className="mt-3 flex gap-2">
              {ANSWER_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setPage(1); setFilter(f.key); }}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${filter === f.key ? "bg-rose-500 text-onaccent" : "border border-stone-200 bg-surface text-stone-500"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {showTypes && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              <FilterChip active={!typeFilter} onClick={() => { setPage(1); setTypeFilter(null); }} label="All types" />
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <FilterChip
                  key={value}
                  active={typeFilter === value}
                  onClick={() => { setPage(1); setTypeFilter(typeFilter === value ? null : value); }}
                  label={label}
                />
              ))}
            </div>
          )}

          {topics.length > 0 && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              <FilterChip active={!topicFilter} onClick={() => { setPage(1); setTopicFilter(null); }} label="All areas" />
              {topics.map((t) => (
                <FilterChip
                  key={t}
                  active={topicFilter === t}
                  onClick={() => { setPage(1); setTopicFilter(topicFilter === t ? null : t); }}
                  label={t}
                />
              ))}
            </div>
          )}
        </div>
      }
    >
        {loading ? (
          <div className="space-y-2 pt-3">
            {Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={search ? Search : meta.Icon}
            title={
              search ? "No matches"
                : !showTabs ? "Nothing here"
                  : filter === "answered" ? "Nothing answered yet"
                    : "All caught up"
            }
            sub={
              search
                ? `Nothing in ${lower} matches “${search}”. Try a shorter word.`
                : !showTabs
                  ? hasChipFilter ? "Nothing here matches these filters." : "This collection is empty."
                  : filter === "answered"
                    ? hasChipFilter
                      ? "Nothing you've answered matches these filters yet."
                      : `Answer something here and it'll show up in this tab.`
                    : hasChipFilter
                      ? "You've answered everything matching these filters. Impressive."
                      : `You've answered every one of the ${lower}. Impressive.`
            }
          />
        ) : (
          <div className="space-y-2 pb-6 pt-3">
            {items.map((it) => (
              <ListRow
                key={it.id}
                item={it}
                Icon={meta.Icon}
                onOpen={() => onOpen(it.id)}
                youName={me?.display_name ?? "You"}
                partnerName={me?.partner?.display_name ?? null}
              />
            ))}
            <Pager page={page} count={count} onPage={setPage} />
          </div>
        )}
      </Screen>
    );
  }

  function Pager({ page, count, onPage }: { page: number; count: number; onPage: (p: number) => void }) {
    const pages = Math.ceil(count / 25);
    if (pages <= 1) return null;
    const step = (p: number) => {
      onPage(p);
      // The app scrolls inside <main>, not the window, so scroll that.
      document.querySelector("main")?.scrollTo({ top: 0 });
    };
    const arrow = "grid h-11 w-11 place-items-center rounded-full border border-stone-200 bg-surface text-stone-600 transition active:scale-90 disabled:opacity-30";
    return (
      <div className="flex items-center justify-between pt-3">
        <button disabled={page <= 1} onClick={() => step(page - 1)} aria-label="Previous page" className={arrow}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-xs font-semibold tabular-nums text-stone-400">Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => step(page + 1)} aria-label="Next page" className={arrow}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    );
  }

  export function DetailView({
    collection,
    id,
    onBack,
    openDay,
  }: {
    collection: string;
    id: string;
    onBack: () => void;
    /** Journeys only: the day to open straight away (a nudge points at a day). */
    openDay?: number;
  }) {
    const ct = SINGULAR[collection] ?? collection;

    // The body of a question/quiz/game never changes, so it can sit in the cache
    // indefinitely; only the bookmark flag needs revalidating.
    const { data: item, loading, error } = useQuery(keys.detail(collection, id), () => content.detail<Item>(collection, id), {
      staleTime: Infinity,
    });
    const { data: mark, set: setMark } = useQuery(keys.bookmark(ct, id), () => bookmarks.check(ct, id));
    const bookmarked = mark?.bookmarked ?? false;

    const toggleBookmark = async () => {
      setMark({ bookmarked: !bookmarked }); // optimistic
      try {
        setMark(await bookmarks.toggle(ct, id));
        invalidate(keys.bookmarks); // the Saved list just changed
      } catch {
        setMark({ bookmarked }); // revert on failure
      }
    };

    return (
      <Screen>
        {/* The bar hides while an inner flow (quiz/game runner, journey day)
            shows its own back control — see HostBar. */}
        <HostBar
          bar={
            <div className="pt-1 pb-2 flex items-center justify-between">
              <button onClick={onBack} aria-label="Back" className="text-rose-600"><ChevronLeft className="h-6 w-6" /></button>
              <button
                onClick={toggleBookmark}
                aria-label={bookmarked ? "Remove bookmark" : "Save"}
                className={`h-10 w-10 grid place-items-center rounded-full border transition active:scale-90 ${bookmarked ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-surface border-stone-200 text-stone-400"
                  }`}
              >
                <Bookmark className={`h-5 w-5 ${bookmarked ? "fill-current" : ""}`} />
              </button>
            </div>
          }
        >
        {loading ? (
          <Spinner />
        ) : !item ? (
          // A failed fetch used to fall through to the spinner and hang there
          // forever, with no way to tell "still loading" from "this is gone".
          <div className="mt-16 text-center px-6">
            <p className="text-stone-500">
              {error instanceof ApiError && error.status === 404
                ? "We couldn't find this one — it may have moved."
                : "Couldn't load this. Check your connection and try again."}
            </p>
            <button onClick={onBack} className="mt-4 font-semibold text-rose-600">
              Go back
            </button>
          </div>
        ) : collection === "questions" ? (
          <QuestionExperience
            questionId={item.id}
            // QuestionExperience fills the invariant's `%{partnerName}` placeholder.
            prompt={questionData(item).invariantQuestion || item.question || titleOf(item)}
            topic={item.topic}
            evidence={questionData(item).evidence}
            image={questionData(item).mainImage?.url}
          />
        ) : collection === "quizzes" ? (
          <QuizExperience quizId={item.id} title={titleOf(item)} data={(item.data ?? {}) as QuizData} />
        ) : collection === "packs" ? (
          <PackExperience title={titleOf(item)} data={(item.data ?? {}) as { description?: string | null; questions?: { id: string; question?: string | null; hint?: string | null }[] }} />
        ) : collection === "games" ? (
          <GameExperience gameId={item.id} title={titleOf(item)} data={(item.data ?? {}) as GameData} />
        ) : collection === "journeys" ? (
          <JourneyExperience journeyId={item.id} title={titleOf(item)} data={(item.data ?? {}) as JourneyData} openDay={openDay} />
        ) : (
          <DetailBody item={item} />
        )}
      </HostBar>
    </Screen>
  );
}

/** Tip detail: the article, then its partner exercise. */
function DetailBody({ item }: { item: Item }) {
  const d = (item.data ?? {}) as Record<string, unknown>;
  const exercise = asExercise(d.partnerExercise);

  return (
    <div className="pb-8">
      <h1 className="text-2xl font-bold text-stone-800 leading-snug">{titleOf(item)}</h1>
      {(item.topic || item.author) && (
        <p className="text-sm text-stone-400 mt-1">{[item.topic, item.author].filter(Boolean).join(" · ")}</p>
      )}
      {item.description && <p className="text-stone-600 mt-3">{item.description}</p>}

      {typeof d.text_html === "string" && <TipBody html={d.text_html} />}
      {exercise && <PartnerExercise tipId={item.id} exercise={exercise} />}
    </div>
  );
}
