"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, Apple, Bell, Calculator, ChartNoAxesColumn, ChefHat, ChevronRight, Droplets,
  Clock3, Eye, Flame, Info, Languages, Library, Moon, NotebookTabs,
  Palette, Percent, PieChart, Pencil, Ruler, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  UserPlus, Users, Utensils, Weight, X,
} from "lucide-react";
import { Card } from "./ui";
import { type HomeVisibility, defaultHomeVisibility, homeCustomizeOptions } from "./home-view";
import { type WaterUnit, formatWaterAmount, waterAmountToMl, waterDisplayValue, waterUnitLabel } from "@/lib/water-units";
import { ConnectedPartnersPanel, InvitePartnerPanel, PartnerDashboard, SharingPermissionsPanel } from "./sharing-settings";
import { RecipeBuilder, type SavedRecipe } from "./recipe-builder";
import { displayPreferences, energyAmountToKcal, energyDisplayValue, formatEnergy, foodAmountToGrams, foodDisplayValue, foodUnitLabel, type DisplayPreferences } from "@/lib/user-preferences";
import { nutrientDefinitions } from "@/lib/nutrition-targets";
import { disableNotifications, enableNotifications } from "@/lib/notifications";
import { FirebaseAccount } from "./firebase-account";
import { applyAppearance, cacheAppearance, readCachedAppearance } from "@/lib/appearance-preferences";
import { showWaterTracking } from "@/lib/ui-features";

export type SettingsPanelId =
  | "food-units" | "height-units" | "weight-units" | "energy-units" | "water-measurement"
  | "calorie-goal" | "calorie-adjustment" | "macro-split" | "meal-split" | "nutrient-goals" | "day-start"
  | "visible-nutrients" | "theme" | "accent" | "language" | "notification-time"
  | "invite-partner" | "connected-partners" | "partner-data" | "sharing-permissions"
  | "add-food" | "add-recipe" | "saved-foods" | "saved-recipes";

type SettingsState = {
  foodUnits: string;
  heightUnits: string;
  weightUnits: string;
  energyUnits: string;
  waterUnit: WaterUnit;
  waterQuickAddMl: number;
  calorieAdjustment: number;
  carbs: number;
  fat: number;
  protein: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
  dayStart: string;
  showActivity: boolean;
  showMacros: boolean;
  showMicros: boolean;
  theme: string;
  accent: string;
  language: string;
  notifications: boolean;
  notificationTime: string;
};

const initialSettings: SettingsState = {
  foodUnits: "Metric (g, ml)", heightUnits: "Metric (cm)", weightUnits: "Kilograms (kg)", energyUnits: "Calories (cal)",
  waterUnit: "ml", waterQuickAddMl: 250,
  calorieAdjustment: 0, carbs: 60, fat: 25, protein: 15, breakfast: 25, lunch: 35, dinner: 30, snack: 10,
  dayStart: "00:00", showActivity: true, showMacros: true, showMicros: true,
  theme: "System default", accent: "#0e7a4d", language: "English",
  notifications: true, notificationTime: "19:00",
};

type DailyPlan = {
  available: boolean;
  missingProfileFields: string[];
  expenditureKcal: number | null;
  weightGoalAdjustmentKcal: number | null;
  manualAdjustmentKcal: number;
  calorieGoalKcal: number | null;
};

type SettingsViewProps = {
  activePanel: SettingsPanelId | null;
  onPanelChange: (panel: SettingsPanelId | null) => void;
  onToast: (message: string) => void;
  homeVisibility: HomeVisibility;
  onHomeVisibilityChange: (visibility: HomeVisibility) => void;
  onWaterSettingsChange: (settings: { unit: WaterUnit; quickAddMl: number }) => void;
  onDisplayPreferencesChange: (preferences: DisplayPreferences) => void;
};

export function SettingsView({ activePanel: panel, onPanelChange, onToast, homeVisibility, onHomeVisibilityChange, onWaterSettingsChange, onDisplayPreferencesChange }: SettingsViewProps) {
  const [settings, setSettings] = useState(() => ({ ...initialSettings, ...readCachedAppearance() }));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const unitPreferences = displayPreferences(settings);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/me/preferences");
        const data = await response.json() as { preferences?: Partial<SettingsState>; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load preferences.");
        if (!cancelled) {
          const next = { ...initialSettings, ...(data.preferences ?? {}) };
          setSettings(next);
          applyAppearance(next);
          cacheAppearance(next);
          onDisplayPreferencesChange(displayPreferences(next));
          setPreferencesError("");
          setPreferencesReady(true);
        }
      } catch (error) {
        if (!cancelled) { setPreferencesError(error instanceof Error ? error.message : "Could not load preferences."); setPreferencesReady(true); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [onDisplayPreferencesChange]);

  useEffect(() => {
    let cancelled = false;
    const date = new Date();
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    void fetch(`/api/dashboard?date=${dateKey}`).then(async (response) => {
      const data = await response.json() as { plan?: DailyPlan; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not load your daily plan.");
      if (!cancelled) setDailyPlan(data.plan ?? null);
    }).catch((error: unknown) => {
      if (!cancelled) setPreferencesError(error instanceof Error ? error.message : "Could not load your daily plan.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: settings }) });
        const data = await response.json() as { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not save preferences.");
        const date = new Date();
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const dashboardResponse = await fetch(`/api/dashboard?date=${dateKey}`);
        const dashboardData = await dashboardResponse.json() as { plan?: DailyPlan; message?: string };
        if (!dashboardResponse.ok) throw new Error(dashboardData.message ?? "Could not refresh your daily plan.");
        setDailyPlan(dashboardData.plan ?? null);
        setPreferencesError("");
      } catch (error) {
        setPreferencesError(error instanceof Error ? error.message : "Could not save preferences.");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [preferencesReady, settings]);

  useEffect(() => {
    if (preferencesReady) onWaterSettingsChange({ unit: settings.waterUnit, quickAddMl: settings.waterQuickAddMl });
  }, [onWaterSettingsChange, preferencesReady, settings.waterQuickAddMl, settings.waterUnit]);

  useEffect(() => {
    if (!preferencesReady) return;
    const appearance = { accent: settings.accent, theme: settings.theme };
    applyAppearance(appearance);
    cacheAppearance(appearance);
  }, [preferencesReady, settings.accent, settings.theme]);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    onDisplayPreferencesChange(displayPreferences(next));
    if (key === "notifications") {
      void (value ? enableNotifications() : disableNotifications()).then(onToast);
    }
  };
  const visibleHomeCount = homeCustomizeOptions.filter(({ id }) => homeVisibility[id]).length;
  const hasHiddenHomeSections = visibleHomeCount < homeCustomizeOptions.length;
  const openPanel = (id: SettingsPanelId) => {
    onPanelChange(id);
  };
  const closePanel = () => {
    onPanelChange(null);
  };

  const groups: Array<{ title: string; description: string; items: SettingDefinition[] }> = [
    {
      title: "Units & energy", description: "Choose how measurements appear throughout the app.",
      items: [
        { id: "food-units", icon: Utensils, title: "Food units", value: settings.foodUnits },
        { id: "height-units", icon: Ruler, title: "Height units", value: settings.heightUnits },
        { id: "weight-units", icon: Weight, title: "Body weight unit", value: settings.weightUnits },
        { id: "energy-units", icon: Flame, title: "Energy unit", value: settings.energyUnits },
        ...(showWaterTracking ? [{ id: "water-measurement" as const, icon: Droplets, title: "Water measurement", value: `${settings.waterUnit === "fl_oz" ? "US fluid ounces" : "Millilitres"} · ${formatWaterAmount(settings.waterQuickAddMl, settings.waterUnit)} quick add` }] : []),
      ],
    },
    {
      title: "Goals & calculations", description: "Tune the targets used for your daily plan.",
      items: [
        { id: "calorie-goal", icon: Calculator, title: "Calorie goal explained", value: dailyPlan?.calorieGoalKcal == null ? "Complete your profile" : `${formatEnergy(dailyPlan.calorieGoalKcal, unitPreferences.energyUnit, unitPreferences.locale)} today` },
        { id: "calorie-adjustment", icon: Percent, title: "Calorie adjustment", value: settings.calorieAdjustment === 0 ? "No adjustment" : `${settings.calorieAdjustment > 0 ? "+" : ""}${formatEnergy(Math.abs(settings.calorieAdjustment), unitPreferences.energyUnit, unitPreferences.locale)}` },
        { id: "macro-split", icon: PieChart, title: "Macro split", value: `${settings.carbs}% / ${settings.fat}% / ${settings.protein}%` },
        { id: "meal-split", icon: Utensils, title: "Per-meal calorie share", value: "Breakfast, lunch, dinner & snack" },
        { id: "nutrient-goals", icon: Sparkles, title: "Nutrient goals", value: "Daily vitamins and minerals" },
        { id: "day-start", icon: Clock3, title: "Diary day starts", value: settings.dayStart },
      ],
    },
    {
      title: "Display", description: "Control the information shown in your diary and meal views.",
      items: [
        { icon: Activity, title: "Show activity tracking", toggle: "showActivity" },
        { icon: ChartNoAxesColumn, title: "Show meal macros", toggle: "showMacros" },
        { icon: Eye, title: "Show micronutrients", toggle: "showMicros" },
        { id: "visible-nutrients", icon: Settings2, title: "Visible nutrients", value: "Choose diary nutrients" },
      ],
    },
    {
      title: "Appearance", description: "Personalize the look and language.",
      items: [
        { id: "theme", icon: Moon, title: "Theme", value: settings.theme },
        { id: "accent", icon: Palette, title: "Accent colour", value: "Custom colour", swatch: settings.accent },
        { id: "language", icon: Languages, title: "Language", value: settings.language },
      ],
    },
    {
      title: "Notifications", description: "Set a gentle daily tracking reminder.",
      items: [
        { icon: Bell, title: "Daily reminder", value: settings.notifications ? settings.notificationTime : "Off", toggle: "notifications" },
        ...(settings.notifications ? [{ id: "notification-time" as const, icon: Clock3, title: "Reminder time", value: settings.notificationTime }] : []),
      ],
    },
    {
      title: "Partner sharing", description: "Invite someone you trust and choose what nutrition data they can see.",
      items: [
        { id: "invite-partner", icon: UserPlus, title: "Invite a partner", value: "Create a private invitation link" },
        { id: "connected-partners", icon: Users, title: "Connected people", value: "Manage connections and pending invitations" },
        { id: "partner-data", icon: ChartNoAxesColumn, title: "Shared with me", value: "View permitted dashboards" },
        { id: "sharing-permissions", icon: ShieldCheck, title: "Sharing permissions", value: "Choose exactly what each person sees" },
      ],
    },
    {
      title: "Food & recipes", description: "Create your own foods and reusable recipes for faster tracking.",
      items: [
        { id: "add-food", icon: Apple, title: "Add a custom food", value: "Nutrition and serving details" },
        { id: "add-recipe", icon: ChefHat, title: "Create a recipe", value: "Combine foods into servings" },
        { id: "saved-foods", icon: Library, title: "My custom foods", value: "12 saved foods" },
        { id: "saved-recipes", icon: NotebookTabs, title: "My recipes", value: "6 saved recipes" },
      ],
    },
  ];

  return (
    <div className="settings-page" id="menu-settings">
      <div className="settings-groups">
        {groups.map((group) => (
          <section className="settings-category" key={group.title}>
            <div className="settings-category-title"><h2>{group.title}</h2><p>{group.description}</p></div>
            <Card className="settings-list">
              {group.items.map((item) => (
                <SettingsRow key={item.title} item={item} settings={settings} update={update} onOpen={openPanel} />
              ))}
            </Card>
          </section>
        ))}
      </div>

      <section className="settings-category">
        <div className="settings-category-title"><h2>Customize home</h2><p>Choose which sections appear on your home dashboard.</p></div>
        <Card className="settings-list home-customize-list">
          <div className="settings-row">
            <span className="round-icon green"><SlidersHorizontal size={19} /></span>
            <span className="settings-row-copy"><strong>Visible sections</strong><small>{visibleHomeCount} of {homeCustomizeOptions.length} shown</small></span>
          </div>
          <div className="home-section-options">
            {homeCustomizeOptions.map((option) => (
              <label key={option.id}>
                <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                <span className="switch"><input type="checkbox" checked={homeVisibility[option.id]} onChange={() => onHomeVisibilityChange({ ...homeVisibility, [option.id]: !homeVisibility[option.id] })} /><span /></span>
              </label>
            ))}
          </div>
          {hasHiddenHomeSections && <div className="customize-actions" style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
            <button onClick={() => onHomeVisibilityChange(defaultHomeVisibility)}>Show all</button>
          </div>}
        </Card>
      </section>

      {preferencesError && <p className="food-picker-error" role="alert">{preferencesError}</p>}
      <FirebaseAccount onToast={onToast} />
      <p className="settings-version">MyFitnessTracker web prototype · Preferences sync to your browser profile</p>

      {panel && (
        <SettingsPanel
          id={panel}
          settings={settings}
          update={update}
          onClose={closePanel}
          onToast={onToast}
          dailyPlan={dailyPlan}
        />
      )}
    </div>
  );
}

type ToggleKey = "showActivity" | "showMacros" | "showMicros" | "notifications";
type SettingDefinition = {
  id?: SettingsPanelId;
  icon: LucideIcon;
  title: string;
  value?: string;
  toggle?: ToggleKey;
  swatch?: string;
  badge?: string;
  danger?: boolean;
};

function SettingsRow({ item, settings, update, onOpen }: {
  item: SettingDefinition;
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  onOpen: (id: SettingsPanelId) => void;
}) {
  const Icon = item.icon;
  const content = <>
    <span className={`round-icon ${item.danger ? "coral" : "green"}`}><Icon size={19} /></span>
    <span className="settings-row-copy"><strong>{item.title}{item.badge && <em>{item.badge}</em>}</strong>{item.value && <small>{item.value}</small>}</span>
  </>;
  if (item.toggle) {
    return <div className="settings-row">{content}<label className="switch"><input aria-label={item.title} type="checkbox" checked={settings[item.toggle]} onChange={(event) => update(item.toggle!, event.target.checked)} /><span /></label></div>;
  }
  return <button className={`settings-row ${item.danger ? "danger" : ""}`} onClick={() => item.id && onOpen(item.id)}>{content}{item.swatch && <i className="accent-swatch" style={{ background: item.swatch }} />}<ChevronRight size={19} /></button>;
}

type PanelProps = {
  id: SettingsPanelId;
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  dailyPlan: DailyPlan | null;
};

function SettingsPanel(props: PanelProps) {
  const title = panelTitles[props.id];
  const readOnly = (["connected-partners", "partner-data", "saved-foods", "saved-recipes"] as SettingsPanelId[]).includes(props.id);
  const actionLabel: Partial<Record<SettingsPanelId, string>> = {
    "invite-partner": "Send invite",
    "sharing-permissions": "Save permissions",
    "add-food": "Save food",
    "add-recipe": "Save recipe",
  };
  const usesOwnSubmit = props.id === "add-food" || props.id === "add-recipe" || props.id === "invite-partner" || props.id === "sharing-permissions";
  const save = () => { props.onClose(); props.onToast(`${title} updated for this prototype.`); };
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="settings-dialog-head"><div><span className="eyebrow">Menu</span><h2 id="settings-dialog-title">{title}</h2></div><button className="icon-button" aria-label="Close" onClick={props.onClose}><X size={20} /></button></div>
        <div className="settings-dialog-body"><PanelContent {...props} /></div>
        <div className="settings-dialog-actions">
          {!readOnly && !usesOwnSubmit && <button className="dialog-cancel" onClick={props.onClose}>Cancel</button>}
          {!usesOwnSubmit && <button className="primary-button" onClick={readOnly ? props.onClose : save}>{readOnly ? "Done" : actionLabel[props.id] ?? "Save changes"}</button>}
        </div>
      </section>
    </div>
  );
}

const panelTitles: Record<SettingsPanelId, string> = {
  "food-units": "Food units", "height-units": "Height units", "weight-units": "Body weight unit", "energy-units": "Energy unit",
  "water-measurement": "Water measurement",
  "calorie-goal": "Your calorie goal", "calorie-adjustment": "Calorie adjustment", "macro-split": "Macro split", "meal-split": "Per-meal calorie share", "nutrient-goals": "Nutrient goals", "day-start": "Diary day start",
  "visible-nutrients": "Visible nutrients", theme: "Theme", accent: "Accent colour", language: "Language", "notification-time": "Reminder time",
  "invite-partner": "Invite a partner", "connected-partners": "Connected people", "partner-data": "Shared with me", "sharing-permissions": "Sharing permissions",
  "add-food": "Add a custom food", "add-recipe": "Create a recipe", "saved-foods": "My custom foods", "saved-recipes": "My recipes",
};

function PanelContent({ id, settings, update, onToast, dailyPlan }: PanelProps) {
  const unitPreferences = displayPreferences(settings);
  switch (id) {
    case "food-units": return <ChoiceList name="food-units" value={settings.foodUnits} options={["Metric (g, ml)", "Imperial (oz, fl oz)"]} onChange={(value) => update("foodUnits", value)} />;
    case "height-units": return <ChoiceList name="height-units" value={settings.heightUnits} options={["Metric (cm)", "Imperial (ft, in)"]} onChange={(value) => update("heightUnits", value)} />;
    case "weight-units": return <ChoiceList name="weight-units" value={settings.weightUnits} options={["Kilograms (kg)", "Pounds (lb)", "Stone (st)"]} onChange={(value) => update("weightUnits", value)} />;
    case "energy-units": return <ChoiceList name="energy-units" value={settings.energyUnits} options={["Calories (cal)", "Kilojoules (kJ)"]} onChange={(value) => update("energyUnits", value)} />;
    case "water-measurement": return <WaterMeasurementPanel key={`${settings.waterUnit}:${settings.waterQuickAddMl}`} settings={settings} update={update} />;
    case "calorie-goal": return <CalorieExplanation plan={dailyPlan} energyUnit={unitPreferences.energyUnit} locale={unitPreferences.locale} />;
    case "calorie-adjustment": { const min = unitPreferences.energyUnit === "kJ" ? -2092 : -500; const max = unitPreferences.energyUnit === "kJ" ? 2092 : 500; const step = unitPreferences.energyUnit === "kJ" ? 104.6 : 25; return <RangeEditor label="Daily adjustment" value={energyDisplayValue(settings.calorieAdjustment, unitPreferences.energyUnit)} min={min} max={max} step={step} unit={unitPreferences.energyUnit} onChange={(value) => update("calorieAdjustment", energyAmountToKcal(value, unitPreferences.energyUnit))} note="Applied after the estimated energy expenditure and weight-goal adjustment." />; }
    case "macro-split": return <div className="slider-stack"><RangeEditor label="Carbohydrates" value={settings.carbs} min={5} max={80} unit="%" onChange={(value) => update("carbs", value)} /><RangeEditor label="Fat" value={settings.fat} min={5} max={60} unit="%" onChange={(value) => update("fat", value)} /><RangeEditor label="Protein" value={settings.protein} min={5} max={60} unit="%" onChange={(value) => update("protein", value)} /><p className={`split-total ${settings.carbs + settings.fat + settings.protein === 100 ? "valid" : ""}`}>Total: {settings.carbs + settings.fat + settings.protein}% · Aim for 100%</p></div>;
    case "meal-split": return <div className="slider-stack"><RangeEditor label="Breakfast" value={settings.breakfast} min={0} max={100} unit="%" onChange={(value) => update("breakfast", value)} /><RangeEditor label="Lunch" value={settings.lunch} min={0} max={100} unit="%" onChange={(value) => update("lunch", value)} /><RangeEditor label="Dinner" value={settings.dinner} min={0} max={100} unit="%" onChange={(value) => update("dinner", value)} /><RangeEditor label="Snack" value={settings.snack} min={0} max={100} unit="%" onChange={(value) => update("snack", value)} /></div>;
    case "nutrient-goals": return <NutrientInputs />;
    case "day-start": return <Field label="New diary day begins"><input type="time" value={settings.dayStart} onChange={(event) => update("dayStart", event.target.value)} /></Field>;
    case "visible-nutrients": return <VisibleNutrientsPanel />;
    case "theme": return <ChoiceList name="theme" value={settings.theme} options={["System default", "Light", "Dark"]} onChange={(value) => update("theme", value)} />;
    case "accent": return <AccentPicker value={settings.accent} onChange={(value) => update("accent", value)} />;
    case "language": return <Field label="App language"><select value={settings.language} onChange={(event) => update("language", event.target.value)}>{["English", "Deutsch", "Čeština", "Italiano", "Polski", "Slovenčina", "Türkçe", "Українська", "中文"].map((language) => <option key={language}>{language}</option>)}</select></Field>;
    case "notification-time": return <Field label="Send my daily reminder at"><input type="time" value={settings.notificationTime} onChange={(event) => update("notificationTime", event.target.value)} /></Field>;
    case "invite-partner": return <InvitePartnerPanel onToast={onToast} />;
    case "connected-partners": return <ConnectedPartnersPanel onToast={onToast} />;
    case "partner-data": return <PartnerDashboard />;
    case "sharing-permissions": return <SharingPermissionsPanel onToast={onToast} />;
    case "add-food": return <AddFoodPanel onToast={onToast} foodUnit={unitPreferences.foodUnit} energyUnit={unitPreferences.energyUnit} />;
    case "add-recipe": return <RecipeBuilder onToast={onToast} energyUnit={unitPreferences.energyUnit} />;
    case "saved-foods": return <SavedFoodsPanel onToast={onToast} foodUnit={unitPreferences.foodUnit} energyUnit={unitPreferences.energyUnit} />;
    case "saved-recipes": return <SavedRecipesPanel onToast={onToast} energyUnit={unitPreferences.energyUnit} />;
  }
}

function ChoiceList({ name, value, options, optionLabel = (option) => option, onChange }: { name: string; value: string; options: string[]; optionLabel?: (option: string) => string; onChange: (value: string) => void }) {
  return <div className="choice-list">{options.map((option) => <label key={option} className={value === option ? "selected" : ""}><input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} /><span>{optionLabel(option)}</span></label>)}</div>;
}

function WaterMeasurementPanel({ settings, update }: { settings: SettingsState; update: PanelProps["update"] }) {
  const [amountInput, setAmountInput] = useState(() => String(Number(waterDisplayValue(settings.waterQuickAddMl, settings.waterUnit).toFixed(settings.waterUnit === "fl_oz" ? 1 : 0))));
  const [error, setError] = useState("");

  const commit = () => {
    const amount = Number(amountInput);
    const amountMl = Math.round(waterAmountToMl(amount, settings.waterUnit));
    if (!amountInput.trim() || !Number.isFinite(amount) || amountMl < 10 || amountMl > 5000) {
      setError("Enter a quick-add amount between 10 and 5,000 ml.");
      return;
    }
    setError("");
    update("waterQuickAddMl", amountMl);
  };

  return <div className="panel-stack">
    <ChoiceList name="water-unit" value={settings.waterUnit} options={["ml", "fl_oz"]} optionLabel={(option) => option === "fl_oz" ? "US fluid ounces (fl oz)" : "Millilitres (ml)"} onChange={(value) => update("waterUnit", value as WaterUnit)} />
    <Field label={`Quick-add amount (${waterUnitLabel(settings.waterUnit)})`}><input type="number" min={settings.waterUnit === "fl_oz" ? 0.5 : 10} max={settings.waterUnit === "fl_oz" ? 169 : 5000} step={settings.waterUnit === "fl_oz" ? 0.5 : 10} value={amountInput} aria-invalid={Boolean(error)} onChange={(event) => setAmountInput(event.target.value)} onBlur={commit} /></Field>
    {error && <p className="food-picker-error" role="alert">{error}</p>}
    <InfoBox>Water is stored in millilitres for accurate totals and converted to your preferred unit when displayed.</InfoBox>
  </div>;
}

function RangeEditor({ label, value, min, max, step = 1, unit, note, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; note?: string; onChange: (value: number) => void }) {
  return <label className="range-editor"><span><strong>{label}</strong><output>{value > 0 && min < 0 ? "+" : ""}{value}{unit}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{note && <small>{note}</small>}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="settings-field"><span>{label}</span>{children}</label>; }

function VisibleNutrientsPanel() {
  const [selected, setSelected] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/visible-nutrients").then(async (response) => {
      const data = await response.json() as { nutrients?: string[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not load visible nutrients.");
      if (!cancelled) { setSelected(data.nutrients ?? []); setReady(true); }
    }).catch((error: unknown) => {
      if (!cancelled) { setMessage(error instanceof Error ? error.message : "Could not load visible nutrients."); setReady(true); }
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = (code: string) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/me/visible-nutrients", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nutrients: selected }) });
      const data = await response.json() as { nutrients?: string[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not save visible nutrients.");
      setSelected(data.nutrients ?? selected);
      setMessage("Visible nutrients saved.");
      window.dispatchEvent(new Event("ont-visible-nutrients"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save visible nutrients.");
    } finally { setSaving(false); }
  };

  return <div className="panel-stack">
    <p className="settings-panel-note">Choose the nutrients shown in your detailed daily targets. Core energy and macro targets remain available.</p>
    <div className="checkbox-list visible-nutrient-list">{nutrientDefinitions.filter((nutrient) => showWaterTracking || nutrient.code !== "water_g").map((nutrient) => <label key={nutrient.code}><input type="checkbox" disabled={!ready || saving} checked={selected.includes(nutrient.code)} onChange={() => toggle(nutrient.code)} /><span><strong>{nutrient.displayName}</strong><small>{nutrient.groupName}</small></span></label>)}</div>
    {message && <p className={message === "Visible nutrients saved." ? "settings-panel-note" : "food-picker-error"} role="status">{message}</p>}
    <button className="primary-button panel-button" disabled={!ready || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save visible nutrients"}</button>
  </div>;
}

function AccentPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colors = [
    ["Leaf", "#0e7a4d"], ["Ocean", "#3974b9"], ["Grape", "#7a55b5"],
    ["Berry", "#b05272"], ["Clay", "#c25f32"], ["Olive", "#59713a"],
  ];
  return <div className="accent-picker">
    <div className="accent-preview" style={{ "--preview-accent": value } as React.CSSProperties}><span><Palette size={21} /></span><div><strong>Accent preview</strong><small>Buttons, progress and selected items</small></div><button>Sample button</button></div>
    <div className="accent-grid">{colors.map(([name, color]) => <button key={color} type="button" title={name} aria-label={`Use ${name}`} aria-pressed={value === color} className={value === color ? "selected" : ""} style={{ background: color }} onClick={() => onChange(color)} />)}</div>
    <Field label="Custom colour"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></Field>
  </div>;
}

function CalorieExplanation({ plan, energyUnit, locale }: { plan: DailyPlan | null; energyUnit: DisplayPreferences["energyUnit"]; locale: string }) {
  if (!plan?.available || plan.expenditureKcal === null || plan.weightGoalAdjustmentKcal === null || plan.calorieGoalKcal === null) {
    const missing = plan?.missingProfileFields.join(", ") || "profile measurements";
    return <InfoBox>Complete your {missing} to calculate a personal calorie goal.</InfoBox>;
  }
  return <div className="calorie-equation"><div><span>Adaptive expenditure</span><strong>{formatEnergy(plan.expenditureKcal, energyUnit, locale)}</strong></div><b>+</b><div><span>Weight-goal adjustment</span><strong>{plan.weightGoalAdjustmentKcal > 0 ? "+" : ""}{formatEnergy(Math.abs(plan.weightGoalAdjustmentKcal), energyUnit, locale)}</strong></div><b>+</b><div><span>Manual adjustment</span><strong>{plan.manualAdjustmentKcal > 0 ? "+" : ""}{formatEnergy(Math.abs(plan.manualAdjustmentKcal), energyUnit, locale)}</strong></div><b>=</b><div className="total"><span>Today’s goal</span><strong>{formatEnergy(plan.calorieGoalKcal, energyUnit, locale)}</strong></div><InfoBox>Activity calories are not added separately. Expenditure is learned from calorie intake and trend weight; optional Apple Health activity only helps the estimate respond to changing activity patterns.</InfoBox></div>;
}

function NutrientInputs() {
  const fields = [["Fiber", "dietary_fiber_g", 30, "g"], ["Sodium", "sodium_mg", 2300, "mg"], ["Potassium", "potassium_mg", 3500, "mg"], ["Vitamin C", "vitamin_c_mg", 90, "mg"], ["Iron", "iron_mg", 18, "mg"], ["Calcium", "calcium_mg", 1000, "mg"]] as const;
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  useEffect(() => { let cancelled = false; void fetch("/api/me/nutrient-goals").then(async (response) => { const data = await response.json() as { goals?: Record<string, number>; message?: string }; if (!response.ok) throw new Error(data.message); if (!cancelled) setGoals(Object.fromEntries(Object.entries(data.goals ?? {}).map(([key, value]) => [key, String(value)]))); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load nutrient goals."); }); return () => { cancelled = true; }; }, []);
  const save = async () => {
    const parsedGoals = Object.fromEntries(fields.map(([, key, fallback]) => [key, Number(goals[key] ?? fallback)]));
    if (fields.some(([, key, fallback]) => !(goals[key] ?? String(fallback)).trim() || !Number.isFinite(parsedGoals[key]) || parsedGoals[key] <= 0 || parsedGoals[key] > 100000)) {
      setMessage("Enter a nutrient goal greater than zero.");
      return;
    }
    try { const response = await fetch("/api/me/nutrient-goals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goals: parsedGoals }) }); const data = await response.json() as { goals?: Record<string, number>; message?: string }; if (!response.ok) throw new Error(data.message); setGoals(Object.fromEntries(Object.entries(data.goals ?? parsedGoals).map(([key, value]) => [key, String(value)]))); setMessage("Nutrient goals saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save nutrient goals."); }
  };
  return <div className="nutrient-goals-form"><div className="nutrient-inputs">{fields.map(([label, key, fallback, unit]) => <label key={key}><span>{label}</span><div><input type="number" min="0" value={goals[key] ?? String(fallback)} inputMode="decimal" onChange={(event) => setGoals((current) => ({ ...current, [key]: event.target.value }))} /><b>{unit}</b></div></label>)}</div><button className="secondary-button panel-button" onClick={() => void save()}>Save nutrient goals</button>{message && <p className="food-picker-error" role="status">{message}</p>}</div>;
}

type CustomFood = {
  id: string;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  servingMl?: number | null;
  servingAmount?: number;
  servingUnit?: string;
  nutritionBasis?: string;
  source?: string;
  barcode?: string | null;
  sourceUrl?: string | null;
  nutrients?: Record<string, number>;
  macros: { energyKcal: number; carbohydrateG: number; totalFatG: number; proteinG: number; dietaryFiberG: number; totalSugarsG: number };
};

type CustomFoodForm = {
  name: string;
  brand: string;
  servingAmount: string;
  energyKcal: string;
  carbohydrateG: string;
  totalFatG: string;
  proteinG: string;
  dietaryFiberG: string;
  totalSugarsG: string;
};
type CustomFoodNumberKey = Exclude<keyof CustomFoodForm, "name" | "brand" | "servingAmount">;

function foodForm(food: CustomFood | undefined, foodUnit: DisplayPreferences["foodUnit"], energyUnit: DisplayPreferences["energyUnit"]): CustomFoodForm {
  return food ? {
    name: food.name, brand: food.brand ?? "", servingAmount: String(Number(foodDisplayValue(food.servingGrams ?? 100, foodUnit).toFixed(2))),
    energyKcal: String(Number(energyDisplayValue(food.macros.energyKcal, energyUnit).toFixed(2))), carbohydrateG: String(food.macros.carbohydrateG), totalFatG: String(food.macros.totalFatG),
    proteinG: String(food.macros.proteinG), dietaryFiberG: String(food.macros.dietaryFiberG), totalSugarsG: String(food.macros.totalSugarsG),
  } : { name: "", brand: "", servingAmount: "100", energyKcal: "0", carbohydrateG: "0", totalFatG: "0", proteinG: "0", dietaryFiberG: "0", totalSugarsG: "0" };
}

function AddFoodPanel({ onToast, food, foodUnit = "metric", energyUnit = "kcal", onSaved, onCancel }: { onToast: (message: string) => void; food?: CustomFood; foodUnit?: DisplayPreferences["foodUnit"]; energyUnit?: DisplayPreferences["energyUnit"]; onSaved?: (food: CustomFood) => void; onCancel?: () => void }) {
  const [form, setForm] = useState(() => foodForm(food, foodUnit, energyUnit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof CustomFoodForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const servingAmount = Number(form.servingAmount);
    const energyKcal = energyAmountToKcal(Number(form.energyKcal), energyUnit);
    const carbohydrateG = Number(form.carbohydrateG);
    const totalFatG = Number(form.totalFatG);
    const proteinG = Number(form.proteinG);
    const dietaryFiberG = Number(form.dietaryFiberG);
    const totalSugarsG = Number(form.totalSugarsG);
    const payload = {
      name: form.name,
      brand: form.brand,
      servingGrams: food?.source === "label_scan" && food.servingGrams === null ? null : foodAmountToGrams(servingAmount, foodUnit),
      energyKcal, carbohydrateG, totalFatG, proteinG, dietaryFiberG, totalSugarsG,
      ...(food?.source === "label_scan" ? { source:food.source, nutritionBasis:food.nutritionBasis, servingMl:food.servingMl ?? null, servingAmount:food.servingAmount ?? 1, servingUnit:food.servingUnit ?? "serving", barcode:food.barcode ?? null, sourceUrl:food.sourceUrl ?? null, nutrients:food.nutrients ?? {} } : {}),
    };
    const numericInputs = [form.servingAmount, form.energyKcal, form.carbohydrateG, form.totalFatG, form.proteinG, form.dietaryFiberG, form.totalSugarsG];
    const numericValues = [payload.servingGrams, energyKcal, carbohydrateG, totalFatG, proteinG, dietaryFiberG, totalSugarsG];
    if (numericInputs.some((value) => !value.trim()) || (payload.servingGrams !== null && (!Number.isFinite(payload.servingGrams) || payload.servingGrams <= 0 || payload.servingGrams > 10000)) || numericValues.slice(1).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000)) {
      setError("Enter a valid serving amount and non-negative nutrition values.");
      return;
    }
    setSaving(true); setError("");
    try {
      const response = await fetch(food ? `/api/custom-foods/${encodeURIComponent(food.id)}` : "/api/custom-foods", { method: food ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as CustomFood & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not save custom food.");
      if (food) {
        onSaved?.(data);
        onToast(`${data.name} updated.`);
      } else {
        setForm(foodForm(undefined, foodUnit, energyUnit));
        onToast(`${data.name ?? "Custom food"} saved.`);
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save custom food."); }
    finally { setSaving(false); }
  };
  const numberField = (label: string, key: CustomFoodNumberKey, unit: string) => {
    const energy = key === "energyKcal";
    return <label><span>{label}</span><div><input type="number" min="0" value={form[key]} onChange={(event) => update(key, event.target.value)} /><b>{energy ? energyUnit : unit}</b></div></label>;
  };
  return <div className="food-form panel-stack">
    <div className="form-row"><Field label="Food name"><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Homemade granola" /></Field><Field label="Brand (optional)"><input value={form.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Homemade" /></Field></div>
    <Field label={`Serving amount (${foodUnitLabel(foodUnit)})`}><input type="number" min="1" value={form.servingAmount} onChange={(event) => update("servingAmount", event.target.value)} /></Field>
    <h3 className="form-subtitle">Nutrition per serving</h3>
    <div className="nutrition-form-grid">{numberField("Calories", "energyKcal", "cal")}{numberField("Carbs", "carbohydrateG", "g")}{numberField("Fat", "totalFatG", "g")}{numberField("Protein", "proteinG", "g")}{numberField("Fiber", "dietaryFiberG", "g")}{numberField("Sugar", "totalSugarsG", "g")}</div>
    {error && <p className="food-picker-error" role="alert">{error}</p>}{food && onCancel && <button className="secondary-button panel-button" disabled={saving} onClick={onCancel}>Cancel editing</button>}<button className="primary-button panel-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : food ? "Update custom food" : "Save custom food"}</button>
  </div>;
}

function SavedFoodsPanel({ onToast, foodUnit = "metric", energyUnit = "kcal" }: { onToast: (message: string) => void; foodUnit?: DisplayPreferences["foodUnit"]; energyUnit?: DisplayPreferences["energyUnit"] }) {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [editing, setEditing] = useState<CustomFood | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/custom-foods");
        const data = await response.json() as { foods?: typeof foods; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load custom foods.");
        if (!cancelled) { setFoods(data.foods ?? []); setError(""); }
      } catch (requestError) { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load custom foods."); }
    };
    void load(); return () => { cancelled = true; };
  }, []);
  const remove = async (food: typeof foods[number]) => {
    if (!window.confirm(`Delete ${food.name}?`)) return;
    try {
      const response = await fetch(`/api/custom-foods/${encodeURIComponent(food.id)}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Could not delete custom food."); }
      setFoods((current) => current.filter((item) => item.id !== food.id)); onToast(`${food.name} deleted.`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete custom food."); }
  };
  if (editing) return <AddFoodPanel key={editing.id} food={editing} foodUnit={foodUnit} energyUnit={energyUnit} onToast={onToast} onSaved={(updated) => { setFoods((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditing(null); }} onCancel={() => setEditing(null)} />;
  return <div className="library-list">{foods.length === 0 && !error && <p className="food-picker-placeholder">No custom foods saved yet.</p>}{foods.map((food) => <div key={food.id}><span className="food-avatar">{food.name.slice(0, 2).toUpperCase()}</span><p><strong>{food.name}</strong><small>{food.brand ? `${food.brand} · ` : ""}{Number(energyDisplayValue(food.macros.energyKcal, energyUnit).toFixed(0))} {energyUnit} · {food.servingGrams === null ? food.nutritionBasis?.replaceAll("_", " ") ?? "label serving" : `${Number(foodDisplayValue(food.servingGrams, foodUnit).toFixed(1))} ${foodUnitLabel(foodUnit)}`}</small></p><span className="library-actions"><button onClick={() => setEditing(food)}><Pencil size={14} /> Edit</button><button onClick={() => void remove(food)}>Delete</button></span></div>)}{error && <p className="food-picker-error" role="alert">{error}</p>}</div>;
}

function SavedRecipesPanel({ onToast, energyUnit = "kcal" }: { onToast: (message: string) => void; energyUnit?: DisplayPreferences["energyUnit"] }) {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [editing, setEditing] = useState<SavedRecipe | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void fetch("/api/recipes").then(async (response) => { const data = await response.json() as { recipes?: typeof recipes; message?: string }; if (!response.ok) throw new Error(data.message); if (!cancelled) setRecipes(data.recipes ?? []); }).catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load recipes."); }); return () => { cancelled = true; }; }, []);
  const remove = async (recipe: typeof recipes[number]) => { if (!window.confirm(`Delete ${recipe.name}?`)) return; try { const response = await fetch(`/api/recipes/${encodeURIComponent(recipe.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not delete recipe."); setRecipes((current) => current.filter((item) => item.id !== recipe.id)); onToast(`${recipe.name} deleted.`); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete recipe."); } };
  if (editing) return <RecipeBuilder key={editing.id} recipe={editing} energyUnit={energyUnit} onToast={onToast} onSaved={(updated) => { setRecipes((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditing(null); }} onCancel={() => setEditing(null)} />;
  return <div className="library-list recipe-library">{recipes.length === 0 && !error && <p className="food-picker-placeholder">No recipes saved yet.</p>}{recipes.map((recipe, index) => <div key={recipe.id}><span className={`food-avatar recipe-${index}`}><ChefHat size={19} /></span><p><strong>{recipe.name}</strong><small>{recipe.servings} servings · {formatEnergy(recipe.macros.energyKcal, energyUnit)} each</small></p><span className="library-actions"><button onClick={() => setEditing(recipe)}><Pencil size={14} /> Edit</button><button onClick={() => void remove(recipe)}>Delete</button></span></div>)}{error && <p className="food-picker-error" role="alert">{error}</p>}</div>;
}

function InfoBox({ children }: { children: React.ReactNode }) { return <div className="info-box"><Info size={17} /><p>{children}</p></div>; }
