"use client";

import { useEffect, useState } from "react";
import {
  Activity, BarChart3, BookOpen, ChevronDown, Home, Moon, Plus, Settings,
  Sun, UserRound, Utensils, Weight, X, Droplets, ScanLine,
} from "lucide-react";
import Image from "next/image";
import { HomeView, type HomeVisibility, defaultHomeVisibility } from "./home-view";
import { DiaryView } from "./diary-view";
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
  { label: "Add a meal", detail: "Search foods or build a meal", icon: Utensils, tone: "green" },
  { label: "Scan a barcode", detail: "Quickly find a packaged food", icon: ScanLine, tone: "teal" },
  { label: "Log activity", detail: "Record a workout or a walk", icon: Activity, tone: "amber" },
  { label: "Log water", detail: "Add to today’s hydration", icon: Droplets, tone: "blue" },
  { label: "Update weight", detail: "Keep your trend up to date", icon: Weight, tone: "coral" },
];

export function AppShell() {
  const [page, setPage] = useState<PageId>("home");
  const [dark, setDark] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanelId | null>(null);
  const [homeVisibility, setHomeVisibility] = useState<HomeVisibility>(defaultHomeVisibility);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const title = page === "home" ? "Good morning, Alex" : page === "settings" ? "Settings" : navigation.find((item) => item.id === page)?.label;
  const openSettings = (panel?: SettingsPanelId) => {
    setSettingsPanel(panel ?? null);
    setPage("settings");
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
          <button onClick={() => setDark((value) => !value)}>
            {dark ? <Sun size={21} /> : <Moon size={21} />}<span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className="account-mini">
            <Image src="/images/avatar.jpg" alt="Alex Demo" width={42} height={42} />
            <div><strong>Alex Demo</strong><span>Demo profile</span></div>
            <ChevronDown size={18} />
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
            <button className="icon-button desktop-theme" aria-label="Toggle color theme" onClick={() => setDark((value) => !value)}>
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={20} /> Add entry</button>
          </div>
        </header>

        <div className="page-content">
          {page === "home" && <HomeView onAdd={() => setAddOpen(true)} visible={homeVisibility} />}
          {page === "diary" && <DiaryView />}
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
              {addActions.map(({ label, detail, icon: Icon, tone }) => (
                <button key={label} className="add-action" onClick={() => { setAddOpen(false); setToast(`${label} selected — ready for backend wiring.`); }}>
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
