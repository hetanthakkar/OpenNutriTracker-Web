"use client";

import { useEffect, useState } from "react";
import {
  Activity, BarChart3, BookOpen, Home, Plus, Settings,
  UserRound, Utensils, Weight, X, Droplets, ScanLine,
} from "lucide-react";
import Image from "next/image";
import { HomeView, type HomeVisibility, defaultHomeVisibility } from "./home-view";
import { DiaryView, type DemoDiaryMeal, type DemoMealSection } from "./diary-view";
import { TrendsView } from "./trends-view";
import { ProfileView } from "./profile-view";
import { SettingsView, type SettingsPanelId } from "./settings-view";

export type PageId = "home" | "diary" | "trends" | "profile" | "settings";

const navigation = [
  { id: "home" as const, label: "Today", icon: Home },
  { id: "diary" as const, label: "Diary", icon: BookOpen },
  { id: "trends" as const, label: "Trends", icon: BarChart3 },
  { id: "profile" as const, label: "You", icon: UserRound },
];

const addActions = [
  { id: "meal" as const, label: "Add a meal", detail: "Add a demo meal to today’s diary", icon: Utensils, tone: "green" },
  { id: "barcode" as const, label: "Scan a barcode", detail: "Use a demo packaged-food match", icon: ScanLine, tone: "teal" },
  { id: "activity" as const, label: "Log activity", detail: "Add a demo workout to today", icon: Activity, tone: "amber" },
  { id: "water" as const, label: "Log water", detail: "Add one 250 ml glass", icon: Droplets, tone: "blue" },
  { id: "weight" as const, label: "Update weight", detail: "Record a demo weight check-in", icon: Weight, tone: "coral" },
];

type AddActionId = (typeof addActions)[number]["id"];
type DemoActivity = { id: number; label: string; detail: string; kcal: number };

function pageFromUrl(rawUrl: string): PageId | null {
  try {
    const url = new URL(rawUrl, "https://opennutritracker.local");
    const target = (url.searchParams.get("page") ?? url.searchParams.get("screen") ?? "").toLowerCase();
    if (["home", "today", "main"].includes(target)) return "home";
    if (target === "diary") return "diary";
    if (target === "trends") return "trends";
    if (["profile", "you"].includes(target)) return "profile";
    if (["settings", "notifications"].includes(target)) return "settings";
    return null;
  } catch {
    return null;
  }
}

export function AppShell() {
  const [page, setPage] = useState<PageId>("home");
  const [dark, setDark] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanelId | null>(null);
  const [homeVisibility, setHomeVisibility] = useState<HomeVisibility>(defaultHomeVisibility);
  const [waterMl, setWaterMl] = useState(1200);
  const [weightKg, setWeightKg] = useState(87);
  const [demoMeals, setDemoMeals] = useState<DemoDiaryMeal[]>([]);
  const [demoActivities, setDemoActivities] = useState<DemoActivity[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const navigate = (rawUrl: string) => {
      const target = pageFromUrl(rawUrl);
      if (!target) return;
      setSettingsPanel(target === "settings" ? null : settingsPanel);
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

  const title = page === "home" ? "Good morning, Alex" : page === "settings" ? "Settings" : navigation.find((item) => item.id === page)?.label;
  const openSettings = (panel?: SettingsPanelId) => {
    setSettingsPanel(panel ?? null);
    setPage("settings");
  };

  const addDemoMeal = (section: DemoMealSection, source: "manual" | "barcode" = "manual") => {
    const id = Date.now() + demoMeals.length;
    const meal: DemoDiaryMeal = source === "barcode"
      ? {
          id,
          section,
          name: "Oat protein bar",
          detail: "Demo barcode match · 1 bar",
          kcal: 210,
          image: "/images/apple.jpg",
        }
      : {
          id,
          section,
          name: section === "Breakfast" ? "Overnight oats" : section === "Lunch" ? "Tofu grain bowl" : "Lentil pasta bowl",
          detail: section === "Breakfast" ? "Oats, berries & chia" : section === "Lunch" ? "Brown rice, tofu & vegetables" : "Tomato, lentils & spinach",
          kcal: section === "Breakfast" ? 412 : section === "Lunch" ? 520 : 486,
          image: section === "Breakfast" ? "/images/bowl.jpg" : "/images/salmon.jpg",
        };
    setDemoMeals((current) => [...current, meal]);
    setToast(`${source === "barcode" ? "Demo barcode item" : `Demo ${section.toLowerCase()}`} added · ${meal.kcal} kcal`);
  };

  const logDemoActivity = () => {
    const next = demoActivities.length + 1;
    setDemoActivities((current) => [...current, { id: Date.now(), label: `Demo cycling ${next}`, detail: "25 min", kcal: 165 }]);
    setToast("Demo activity added · 25 min · 165 kcal");
  };

  const addWater = () => {
    setWaterMl((current) => Math.min(current + 250, 3000));
    setToast("250 ml water added");
  };

  const updateWeight = () => {
    setWeightKg((current) => Number(Math.max(40, current - 0.2).toFixed(1)));
    setToast("Demo weight check-in recorded");
  };

  const handleAddAction = (id: AddActionId) => {
    setAddOpen(false);
    if (id === "meal") {
      addDemoMeal("Dinner");
      setPage("diary");
      return;
    }
    if (id === "barcode") {
      addDemoMeal("Dinner", "barcode");
      setPage("diary");
      return;
    }
    if (id === "activity") {
      logDemoActivity();
      setPage("home");
      return;
    }
    if (id === "water") {
      addWater();
      setPage("home");
      return;
    }
    updateWeight();
    setPage("home");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image src="/logo.svg" alt="" width={38} height={38} priority />
          <span>OpenNutriTracker</span>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <Icon size={22} strokeWidth={page === id ? 2.6 : 2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={page === "settings" ? "active" : ""} onClick={() => openSettings()}><Settings size={21} /><span>Settings</span></button>
          <div className="account-mini">
            <Image src="/images/avatar.jpg" alt="Alex Demo" width={42} height={42} />
            <div><strong>Alex Demo</strong><span>Demo profile</span></div>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">Saturday, September 5</span>
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
              weightKg={weightKg}
              extraActivities={demoActivities}
              onLogActivity={logDemoActivity}
              onAddWater={addWater}
            />
          )}
          {page === "diary" && <DiaryView extraMeals={demoMeals} onAddMeal={(section) => addDemoMeal(section)} />}
          {page === "trends" && <TrendsView />}
          {page === "profile" && <ProfileView onToast={setToast} onOpenSettings={openSettings} />}
          {page === "settings" && <SettingsView dark={dark} initialPanel={settingsPanel} onSetDark={setDark} onToast={setToast} homeVisibility={homeVisibility} onHomeVisibilityChange={setHomeVisibility} />}
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
            <div className="sheet-header"><div><span className="eyebrow">Saturday, September 5</span><h2 id="add-title">What would you like to log?</h2></div><button className="icon-button" aria-label="Close" onClick={() => setAddOpen(false)}><X size={20} /></button></div>
            <div className="add-grid">
              {addActions.map(({ id, label, detail, icon: Icon, tone }) => (
                <button key={id} className="add-action" onClick={() => handleAddAction(id)}>
                  <span className={`icon-badge ${tone}`}><Icon size={22} /></span><span><strong>{label}</strong><small>{detail}</small></span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
