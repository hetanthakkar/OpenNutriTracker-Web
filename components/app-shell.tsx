"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, BarChart3, BookOpen, Home, Plus, Users,
  Utensils, Weight, X, Droplets, ScanLine,
} from "lucide-react";
import { HomeView, type HomeVisibility, defaultHomeVisibility } from "./home-view";
import { DiaryView } from "./diary-view";
import { TrendsView } from "./trends-view";
import { ProfileView } from "./profile-view";
import { SettingsView, type SettingsPanelId } from "./settings-view";
import { FoodPicker, type FoodPickerSelection } from "./food-picker";
import { WeightEntryDialog } from "./weight-entry-dialog";
import { VeganScanner } from "./vegan-scanner";
import { ActivityEntryDialog, type ActivityEntryInput } from "./activity-entry-dialog";
import { InvitationAcceptance } from "./invitation-acceptance";
import { OnboardingFlow, type OnboardingInitialData, type OnboardingResult } from "./onboarding-flow";
import { FirebaseAuthGate } from "./firebase-account";
import { completeRedirectSignIn, firebaseAuthConfigured } from "@/lib/firebase-auth";
import { type WaterUnit, formatWaterAmount } from "@/lib/water-units";
import { defaultDisplayPreferences, diaryDateKey, displayPreferences, type DisplayPreferences } from "@/lib/user-preferences";
import { applyAppearance, cacheAppearance, readCachedAppearance } from "@/lib/appearance-preferences";
import { showWaterTracking } from "@/lib/ui-features";

export type PageId = "home" | "diary" | "trends" | "menu";

const navigation = [
  { id: "home" as const, label: "Today", icon: Home },
  { id: "diary" as const, label: "Diary", icon: BookOpen },
  { id: "trends" as const, label: "Trends", icon: BarChart3 },
  { id: "menu" as const, label: "Account", icon: Users },
];

const addActions = [
  { id: "meal" as const, label: "Add a meal", detail: "Search foods and add one to your diary", icon: Utensils, tone: "green" },
  { id: "barcode" as const, label: "Scan barcode or nutrition", detail: "Scan a barcode or read a nutrition label", icon: ScanLine, tone: "teal" },
  { id: "vegan" as const, label: "Vegan scanner", detail: "Check a package against vegan product data", icon: ScanLine, tone: "green" },
  { id: "activity" as const, label: "Log activity", detail: "Add a workout to today", icon: Activity, tone: "amber" },
  { id: "water" as const, label: "Log water", detail: "Add one 250 ml glass", icon: Droplets, tone: "blue" },
  { id: "weight" as const, label: "Update weight", detail: "Record a weight check-in", icon: Weight, tone: "coral" },
];

type AddActionId = (typeof addActions)[number]["id"];
type ActivitySummary = { id: string; label: string; detail: string; kcal: number };
type ActivityApiEntry = { id: string; name: string; durationMinutes: number; energyKcal: number; loggedAt: string };
type AuthStatus = { user: { email: string | null; name: string | null } | null; configured: boolean };

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pageFromUrl(rawUrl: string): PageId | null {
  try {
    const url = new URL(rawUrl, "https://opennutritracker.local");
    const target = (url.searchParams.get("page") ?? url.searchParams.get("screen") ?? "").toLowerCase();
    if (["home", "today", "main"].includes(target)) return "home";
    if (target === "diary") return "diary";
    if (target === "trends") return "trends";
    if (["profile", "you", "settings", "notifications", "menu"].includes(target)) return "menu";
    return null;
  } catch {
    return null;
  }
}

export function AppShell() {
  const [page, setPage] = useState<PageId>("home");
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanelId | null>(null);
  const [homeVisibility, setHomeVisibility] = useState<HomeVisibility>(defaultHomeVisibility);
  const [waterMl, setWaterMl] = useState(0);
  const [waterGoalMl, setWaterGoalMl] = useState<number | null>(null);
  const [waterUnit, setWaterUnit] = useState<WaterUnit>("ml");
  const [waterQuickAddMl, setWaterQuickAddMl] = useState(250);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [weightEntryOpen, setWeightEntryOpen] = useState(false);
  const [activityEntryOpen, setActivityEntryOpen] = useState(false);
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [foodPickerMode, setFoodPickerMode] = useState<"search" | "barcode" | null>(null);
  const [veganScannerOpen, setVeganScannerOpen] = useState(false);
  const [foodPickerDate, setFoodPickerDate] = useState(localDateKey(new Date()));
  const [diaryRefreshVersion, setDiaryRefreshVersion] = useState(0);
  const [trackingRefreshVersion, setTrackingRefreshVersion] = useState(0);
  const [profileName, setProfileName] = useState("Profile");
  const [display, setDisplay] = useState<DisplayPreferences>(defaultDisplayPreferences);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingInitialData | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    applyAppearance(readCachedAppearance());
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => applyAppearance({});
    systemTheme.addEventListener("change", syncSystemTheme);
    return () => systemTheme.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInvitationToken(new URLSearchParams(window.location.search).get("invite")));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const closeInvitation = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setInvitationToken(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(async () => {
      try {
        const readAuthStatus = async () => {
          const authResponse = await fetch("/api/auth/session", { cache: "no-store" });
          const authData = await authResponse.json() as AuthStatus;
          if (!authResponse.ok) throw new Error("Could not load sign-in status.");
          return { user: authData.user ?? null, configured: authData.configured === true } satisfies AuthStatus;
        };
        let nextAuthStatus = await readAuthStatus();
        if (nextAuthStatus.configured && !nextAuthStatus.user && firebaseAuthConfigured() && await completeRedirectSignIn()) {
          nextAuthStatus = await readAuthStatus();
        }
        if (cancelled) return;
        setAuthStatus(nextAuthStatus);
        if (nextAuthStatus.configured && !nextAuthStatus.user) return;

        const [response, profileResponse, weightResponse] = await Promise.all([
          fetch("/api/me/preferences"), fetch("/api/me"), fetch("/api/weights"),
        ]);
        const data = await response.json() as { preferences?: Record<string, unknown> };
        const profileData = await profileResponse.json() as OnboardingInitialData["profile"];
        const weightData = await weightResponse.json() as { latest?: { weightKg?: number } | null };
        if (!response.ok || !profileResponse.ok || cancelled) return;
        const preferences = data.preferences ?? {};
        setDisplay(displayPreferences(preferences));
        applyAppearance(preferences);
        cacheAppearance(preferences);
        if (typeof profileData.displayName === "string" && profileData.displayName.trim()) setProfileName(profileData.displayName.trim());
        const profileWaterGoal = Number(profileData.waterGoalMl);
        if (Number.isFinite(profileWaterGoal) && profileWaterGoal > 0) setWaterGoalMl(profileWaterGoal);
        if (preferences.waterUnit === "ml" || preferences.waterUnit === "fl_oz") setWaterUnit(preferences.waterUnit);
        if (typeof preferences.waterQuickAddMl === "number" && preferences.waterQuickAddMl >= 10 && preferences.waterQuickAddMl <= 5000) setWaterQuickAddMl(Math.round(preferences.waterQuickAddMl));
        setHomeVisibility((current) => ({
          quickStats: typeof preferences.homeQuickStats === "boolean" ? preferences.homeQuickStats : current.quickStats,
          energy: typeof preferences.homeEnergy === "boolean" ? preferences.homeEnergy : current.energy,
          scores: typeof preferences.homeScores === "boolean" ? preferences.homeScores : current.scores,
          meals: typeof preferences.homeMeals === "boolean" ? preferences.homeMeals : current.meals,
          streak: typeof preferences.homeStreak === "boolean" ? preferences.homeStreak : current.streak,
          activity: typeof preferences.homeActivity === "boolean" ? preferences.homeActivity : current.activity,
          habits: typeof preferences.homeHabits === "boolean" ? preferences.homeHabits : current.habits,
          targets: typeof preferences.homeTargets === "boolean" ? preferences.homeTargets : current.targets,
        }));
        const profileIncomplete = profileData.displayName === "My profile"
          || profileData.heightCm == null || profileData.dateOfBirth == null || profileData.energyEquationSex == null;
        if (!cancelled && nextAuthStatus.configured && nextAuthStatus.user && preferences.onboardingComplete !== true && profileIncomplete) {
          setOnboardingData({
            suggestedName: nextAuthStatus.user.name?.trim() || "",
            profile: profileData,
            preferences,
            currentWeightKg: Number.isFinite(Number(weightData.latest?.weightKg)) ? Number(weightData.latest?.weightKg) : null,
          });
          setOnboardingOpen(true);
        }
      } catch {
        if (!cancelled) setAuthStatus((current) => current ?? { user: null, configured: false });
      }
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, []);

  const updateHomeVisibility = (next: HomeVisibility) => {
    setHomeVisibility(next);
    void fetch("/api/me/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: {
        homeQuickStats: next.quickStats, homeEnergy: next.energy, homeScores: next.scores, homeMeals: next.meals,
        homeStreak: next.streak, homeActivity: next.activity, homeHabits: next.habits, homeTargets: next.targets,
      } }),
    });
  };

  const updateWaterSettings = useCallback((next: { unit: WaterUnit; quickAddMl: number }) => {
    setWaterUnit(next.unit);
    setWaterQuickAddMl(next.quickAddMl);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const refreshTracking = () => {
      setTrackingRefreshVersion((current) => current + 1);
      setDiaryRefreshVersion((current) => current + 1);
    };
    window.addEventListener("ont-tracking-updated", refreshTracking);
    return () => window.removeEventListener("ont-tracking-updated", refreshTracking);
  }, []);

  useEffect(() => {
    const navigate = (rawUrl: string) => {
      const target = pageFromUrl(rawUrl);
      if (!target) return;
      setSettingsPanel(target === "menu" ? null : settingsPanel);
      setPage(target);
    };

    navigate(window.location.href);

    const onNavigate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (url) navigate(url);
    };

    window.addEventListener("ont:navigate", onNavigate as EventListener);
    return () => window.removeEventListener("ont:navigate", onNavigate as EventListener);
    // This listener intentionally owns only notification/launch navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authStatus === null || (authStatus.configured && !authStatus.user)) return;
    let cancelled = false;
    const loadWeight = async () => {
      try {
        const response = await fetch("/api/weights");
        const data = await response.json() as { latest?: { weightKg: number } | null; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load your weight.");
        if (!cancelled) setWeightKg(data.latest?.weightKg ?? null);
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load your weight.");
      }
    };
    void loadWeight();
    return () => { cancelled = true; };
  }, [authStatus, trackingRefreshVersion]);

  useEffect(() => {
    if (authStatus === null || (authStatus.configured && !authStatus.user)) return;
    let cancelled = false;
    const loadActivities = async () => {
      try {
        const response = await fetch(`/api/activities?date=${diaryDateKey(new Date(), display.dayStart)}`);
        const data = await response.json() as { entries?: ActivityApiEntry[]; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load activities.");
        if (!cancelled) setActivities((data.entries ?? []).map((entry) => ({
          id: entry.id, label: entry.name, detail: `${entry.durationMinutes} min`, kcal: entry.energyKcal,
        })));
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load activities.");
      }
    };
    void loadActivities();
    return () => { cancelled = true; };
  }, [authStatus, display.dayStart, trackingRefreshVersion]);

  useEffect(() => {
    if (authStatus === null || (authStatus.configured && !authStatus.user)) return;
    let cancelled = false;
    const loadWater = async () => {
      try {
        const response = await fetch(`/api/water?date=${diaryDateKey(new Date(), display.dayStart)}`);
        const data = await response.json() as { totalMl?: number; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load water entries.");
        const totalMl = Number(data.totalMl);
        if (!cancelled) setWaterMl(Number.isFinite(totalMl) ? totalMl : 0);
      } catch (error) {
        if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load water entries.");
      }
    };
    void loadWater();
    return () => { cancelled = true; };
  }, [authStatus, display.dayStart, trackingRefreshVersion]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = profileName.trim().split(/\s+/)[0] || "there";
  const todayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now);
  const title = page === "home" ? `${greeting}, ${firstName}` : navigation.find((item) => item.id === page)?.label;
  const openSettings = (panel?: SettingsPanelId) => {
    setSettingsPanel(panel ?? null);
    setPage("menu");
  };

  const completeOnboarding = (result: OnboardingResult) => {
    setOnboardingOpen(false);
    setOnboardingData(null);
    setProfileName(result.displayName);
    setWaterGoalMl(result.waterGoalMl);
    setWeightKg(result.currentWeightKg);
    setDisplay(displayPreferences(result.preferences));
    if (result.preferences.waterUnit === "ml" || result.preferences.waterUnit === "fl_oz") setWaterUnit(result.preferences.waterUnit);
    if (typeof result.preferences.waterQuickAddMl === "number") setWaterQuickAddMl(Math.round(result.preferences.waterQuickAddMl));
    setHomeVisibility((current) => ({
      quickStats: typeof result.preferences.homeQuickStats === "boolean" ? result.preferences.homeQuickStats : current.quickStats,
      energy: typeof result.preferences.homeEnergy === "boolean" ? result.preferences.homeEnergy : current.energy,
      scores: typeof result.preferences.homeScores === "boolean" ? result.preferences.homeScores : current.scores,
      meals: typeof result.preferences.homeMeals === "boolean" ? result.preferences.homeMeals : current.meals,
      streak: typeof result.preferences.homeStreak === "boolean" ? result.preferences.homeStreak : current.streak,
      activity: typeof result.preferences.homeActivity === "boolean" ? result.preferences.homeActivity : current.activity,
      habits: typeof result.preferences.homeHabits === "boolean" ? result.preferences.homeHabits : current.habits,
      targets: typeof result.preferences.homeTargets === "boolean" ? result.preferences.homeTargets : current.targets,
    }));
    applyAppearance(result.preferences);
    cacheAppearance(result.preferences);
    setDiaryRefreshVersion((current) => current + 1);
    setToast("Your profile is ready");
  };

  const saveActivity = async (entry: ActivityEntryInput) => {
    const activityDate = new Date(entry.loggedAt);
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, diaryDate: diaryDateKey(activityDate, display.dayStart) }),
    });
    const data = await response.json() as ActivityApiEntry & { message?: string };
    if (!response.ok) throw new Error(data.message ?? "Could not save activity.");
    if (diaryDateKey(activityDate, display.dayStart) === diaryDateKey(new Date(), display.dayStart)) {
      setActivities((current) => [...current, { id: data.id, label: data.name, detail: `${data.durationMinutes} min`, kcal: data.energyKcal }]);
    }
    setActivityEntryOpen(false);
    setDiaryRefreshVersion((current) => current + 1);
    setPage("home");
    setToast(`${data.name} added · ${data.durationMinutes} min · ${data.energyKcal} cal`);
  };

  const addWater = async () => {
    try {
      const response = await fetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl: waterQuickAddMl, diaryDate: diaryDateKey(new Date(), display.dayStart) }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not save water.");
      setWaterMl((current) => current + waterQuickAddMl);
      setDiaryRefreshVersion((current) => current + 1);
      setToast(`${formatWaterAmount(waterQuickAddMl, waterUnit)} water added`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not save water.");
    }
  };

  const saveWeight = async (nextWeightKg: number) => {
    const response = await fetch("/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weightKg: nextWeightKg }),
    });
    const data = await response.json() as { weightKg?: number; message?: string };
    if (!response.ok) throw new Error(data.message ?? "Could not save weight.");
    setWeightKg(data.weightKg ?? nextWeightKg);
    setDiaryRefreshVersion((current) => current + 1);
    setWeightEntryOpen(false);
    setToast("Weight recorded");
  };

  const handleAddAction = (id: AddActionId) => {
    setAddOpen(false);
    if (id === "meal") {
      const now = new Date();
      setFoodPickerDate(diaryDateKey(now, display.dayStart));
      setFoodPickerMode("search");
      return;
    }
    if (id === "barcode") {
      const now = new Date();
      setFoodPickerDate(diaryDateKey(now, display.dayStart));
      setFoodPickerMode("barcode");
      return;
    }
    if (id === "vegan") {
      setVeganScannerOpen(true);
      return;
    }
    if (id === "activity") {
      setActivityEntryOpen(true);
      setPage("home");
      return;
    }
    if (id === "water") {
      addWater();
      setPage("home");
      return;
    }
    setWeightEntryOpen(true);
    setPage("home");
  };

  const addCatalogFoodToDiary = async (selection: FoodPickerSelection) => {
    const response = await fetch("/api/diary/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogFoodId: selection.catalogFoodId,
        mfpFoodId: selection.mfpFoodId,
        customFoodId: selection.customFoodId,
        recipeId: selection.recipeId,
        mealType: selection.section.toLowerCase(),
        portionId: selection.portionId,
        amount: selection.amount,
        loggedAt: selection.loggedAt,
        diaryDate: selection.diaryDate,
      }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) throw new Error(data.message ?? "Could not save this diary entry.");

    setDiaryRefreshVersion((current) => current + 1);
    setFoodPickerMode(null);
    setPage("home");
    setToast(`${selection.name} added · ${selection.kcal} cal`);
  };

  if (authStatus === null) {
    return <main className="auth-loading-shell" aria-live="polite">Loading your account…</main>;
  }

  if (authStatus.configured && !authStatus.user) {
    return <FirebaseAuthGate />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>MyFitnessTracker</span>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <Icon size={22} strokeWidth={page === id ? 2.6 : 2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">{todayLabel}</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={20} /> Add entry</button>
          </div>
        </header>

        <div className="page-content">
          {page === "home" && (
            <HomeView
              visible={homeVisibility}
              waterMl={waterMl}
              waterGoalMl={waterGoalMl}
              waterUnit={waterUnit}
              waterQuickAddMl={waterQuickAddMl}
              weightKg={weightKg}
              extraActivities={activities}
              diaryRefreshVersion={diaryRefreshVersion}
              diaryDate={diaryDateKey(new Date(), display.dayStart)}
              dashboardCacheScope={authStatus?.user?.email ?? "local"}
              energyUnit={display.energyUnit}
              weightUnit={display.weightUnit}
              locale={display.locale}
              showMacros={display.showMacros}
              showActivity={display.showActivity}
              onLogActivity={() => setActivityEntryOpen(true)}
              onAddWater={addWater}
            />
          )}
          {page === "diary" && <DiaryView refreshVersion={diaryRefreshVersion} cacheScope={authStatus?.user?.email ?? "local"} energyUnit={display.energyUnit} locale={display.locale} showMacros={display.showMacros} dayStart={display.dayStart} />}
          {page === "trends" && <TrendsView waterUnit={waterUnit} energyUnit={display.energyUnit} weightUnit={display.weightUnit} locale={display.locale} dayStart={display.dayStart} showActivity={display.showActivity} cacheScope={authStatus?.user?.email ?? "local"} refreshVersion={diaryRefreshVersion} />}
          {page === "menu" && <div className="menu-page">
            <div className="menu-intro"><span className="eyebrow">Everything in one place</span><h2>Profile, preferences, and tools</h2><p>Manage your nutrition plan, account, sharing, food library, and app options from this menu.</p></div>
            <ProfileView onToast={setToast} onOpenSettings={openSettings} onAddWeight={() => setWeightEntryOpen(true)} cacheScope={authStatus?.user?.email ?? "local"} weightKg={weightKg} waterUnit={waterUnit} weightUnit={display.weightUnit} heightUnit={display.heightUnit} locale={display.locale} onProfileChange={(profile) => { setProfileName(profile.displayName); setWaterGoalMl(profile.waterGoalMl); setDiaryRefreshVersion((current) => current + 1); }} />
            <SettingsView activePanel={settingsPanel} onPanelChange={setSettingsPanel} onToast={setToast} homeVisibility={homeVisibility} onHomeVisibilityChange={updateHomeVisibility} onWaterSettingsChange={updateWaterSettings} onDisplayPreferencesChange={setDisplay} />
          </div>}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 2).map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={22} /><span>{label}</span></button>
        ))}
        <button className="mobile-add" aria-label="Add entry" onClick={() => setAddOpen(true)}><Plus size={29} /></button>
        {navigation.slice(2).map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={22} /><span>{label}</span></button>
        ))}
      </nav>

      {addOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAddOpen(false)}>
          <section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header"><div><span className="eyebrow">{todayLabel}</span><h2 id="add-title">What would you like to log?</h2></div><button className="icon-button" aria-label="Close" onClick={() => setAddOpen(false)}><X size={20} /></button></div>
            <div className="add-grid">
              {/* Temporarily hide Vegan scanner from the add menu while its flow is being revised. */}
              {addActions.filter((action) => action.id !== "vegan" && (display.showActivity || action.id !== "activity") && (showWaterTracking || action.id !== "water")).map(({ id, label, detail, icon: Icon, tone }) => (
                <button key={id} className="add-action" onClick={() => handleAddAction(id)}>
                  <span className={`icon-badge ${tone}`}><Icon size={22} /></span><span><strong>{label}</strong><small>{id === "water" ? `Add ${formatWaterAmount(waterQuickAddMl, waterUnit)}` : detail}</small></span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {foodPickerMode && <FoodPicker mode={foodPickerMode} initialDate={foodPickerDate} dayStart={display.dayStart} foodUnit={display.foodUnit} energyUnit={display.energyUnit} locale={display.locale} showMicros={display.showMicros} onClose={() => setFoodPickerMode(null)} onAddToDiary={addCatalogFoodToDiary} />}
      {veganScannerOpen && <VeganScanner onClose={() => setVeganScannerOpen(false)} />}
      {weightEntryOpen && <WeightEntryDialog initialWeightKg={weightKg} weightUnit={display.weightUnit} onClose={() => setWeightEntryOpen(false)} onSave={saveWeight} />}
      {activityEntryOpen && <ActivityEntryDialog energyUnit={display.energyUnit} onClose={() => setActivityEntryOpen(false)} onSave={saveActivity} />}
      {onboardingOpen && onboardingData && <OnboardingFlow data={onboardingData} onComplete={completeOnboarding} />}
      {invitationToken && <InvitationAcceptance token={invitationToken} onClose={closeInvitation} onAccepted={(ownerName) => { closeInvitation(); setToast(`Connected with ${ownerName}`); setPage("menu"); setSettingsPanel("partner-data"); }} />}
    </div>
  );
}
