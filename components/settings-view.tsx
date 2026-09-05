"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, Apple, Bell, Calculator, ChartNoAxesColumn, ChefHat, ChevronLeft, ChevronRight,
  Clock3, Copy, Eye, Flame, Info, Languages, Library, Mail, Moon, NotebookTabs,
  Palette, Percent, PieChart, Plus, Ruler, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  UserPlus, Users, Utensils, Weight, X,
} from "lucide-react";
import { Card } from "./ui";
import { type HomeVisibility, defaultHomeVisibility, homeCustomizeOptions } from "./home-view";

export type SettingsPanelId =
  | "food-units" | "height-units" | "weight-units" | "energy-units"
  | "calorie-goal" | "calorie-adjustment" | "macro-split" | "meal-split" | "nutrient-goals" | "day-start"
  | "visible-nutrients" | "theme" | "accent" | "language" | "notification-time"
  | "invite-partner" | "connected-partners" | "partner-data" | "sharing-permissions"
  | "add-food" | "add-recipe" | "saved-foods" | "saved-recipes";

type SettingsState = {
  foodUnits: string;
  heightUnits: string;
  weightUnits: string;
  energyUnits: string;
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
  foodUnits: "Metric (g, ml)", heightUnits: "Metric (cm)", weightUnits: "Kilograms (kg)", energyUnits: "Kilocalories (kcal)",
  calorieAdjustment: 0, carbs: 60, fat: 25, protein: 15, breakfast: 25, lunch: 35, dinner: 30, snack: 10,
  dayStart: "00:00", showActivity: true, showMacros: true, showMicros: true,
  theme: "System default", accent: "#0e7a4d", language: "English",
  notifications: true, notificationTime: "19:00",
};

type SettingsViewProps = {
  dark: boolean;
  initialPanel?: SettingsPanelId | null;
  onSetDark: (value: boolean) => void;
  onToast: (message: string) => void;
  homeVisibility: HomeVisibility;
  onHomeVisibilityChange: (visibility: HomeVisibility) => void;
};

export function SettingsView({ dark, initialPanel, onSetDark, onToast, homeVisibility, onHomeVisibilityChange }: SettingsViewProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [panel, setPanel] = useState<SettingsPanelId | null>(initialPanel ?? null);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.documentElement.style.setProperty("--accent-soft", `${settings.accent}20`);
  }, [settings.accent]);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const groups: Array<{ title: string; description: string; items: SettingDefinition[] }> = [
    {
      title: "Units & energy", description: "Choose how measurements appear throughout the app.",
      items: [
        { id: "food-units", icon: Utensils, title: "Food units", value: settings.foodUnits },
        { id: "height-units", icon: Ruler, title: "Height units", value: settings.heightUnits },
        { id: "weight-units", icon: Weight, title: "Body weight unit", value: settings.weightUnits },
        { id: "energy-units", icon: Flame, title: "Energy unit", value: settings.energyUnits },
      ],
    },
    {
      title: "Goals & calculations", description: "Tune the targets used for your daily plan.",
      items: [
        { id: "calorie-goal", icon: Calculator, title: "Calorie goal explained", value: "2,855 kcal today" },
        { id: "calorie-adjustment", icon: Percent, title: "Calorie adjustment", value: settings.calorieAdjustment === 0 ? "No adjustment" : `${settings.calorieAdjustment > 0 ? "+" : ""}${settings.calorieAdjustment} kcal` },
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
        { id: "invite-partner", icon: UserPlus, title: "Invite a partner", value: "Send an email invitation" },
        { id: "connected-partners", icon: Users, title: "Connected people", value: "1 partner connected" },
        { id: "partner-data", icon: ChartNoAxesColumn, title: "Jamie’s shared dashboard", value: "View meals, goals and progress" },
        { id: "sharing-permissions", icon: ShieldCheck, title: "Sharing permissions", value: "Meals, calories and trends" },
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
    <div className="settings-page">
      <div className="settings-groups">
        {groups.map((group) => (
          <section className="settings-category" key={group.title}>
            <div className="settings-category-title"><h2>{group.title}</h2><p>{group.description}</p></div>
            <Card className="settings-list">
              {group.items.map((item) => (
                <SettingsRow key={item.title} item={item} settings={settings} update={update} onOpen={setPanel} />
              ))}
            </Card>
          </section>
        ))}
      </div>

      <section className="settings-category">
        <div className="settings-category-title"><h2>Customize home</h2><p>Choose which sections appear on your home dashboard.</p></div>
        <Card className="settings-list">
          <div className="settings-row">
            <span className="round-icon green"><SlidersHorizontal size={19} /></span>
            <span className="settings-row-copy"><strong>Visible sections</strong><small>{Object.values(homeVisibility).filter(Boolean).length} of {homeCustomizeOptions.length} shown</small></span>
          </div>
          <div className="home-section-options">
            {homeCustomizeOptions.map((option) => (
              <label key={option.id}>
                <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                <span className="switch"><input type="checkbox" checked={homeVisibility[option.id]} onChange={() => onHomeVisibilityChange({ ...homeVisibility, [option.id]: !homeVisibility[option.id] })} /><span /></span>
              </label>
            ))}
          </div>
          <div className="customize-actions" style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
            <button onClick={() => onHomeVisibilityChange(defaultHomeVisibility)}>Show all</button>
          </div>
        </Card>
      </section>

      <p className="settings-version">OpenNutriTracker web prototype · Settings are stored in component state only</p>

      {panel && (
        <SettingsPanel
          id={panel}
          dark={dark}
          settings={settings}
          update={update}
          onSetDark={onSetDark}
          onClose={() => setPanel(null)}
          onToast={onToast}
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
  dark: boolean;
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  onSetDark: (value: boolean) => void;
  onClose: () => void;
  onToast: (message: string) => void;
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
  const save = () => { props.onClose(); props.onToast(`${title} updated for this prototype.`); };
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="settings-dialog-head"><div><span className="eyebrow">Settings</span><h2 id="settings-dialog-title">{title}</h2></div><button className="icon-button" aria-label="Close" onClick={props.onClose}><X size={20} /></button></div>
        <div className="settings-dialog-body"><PanelContent {...props} /></div>
        <div className="settings-dialog-actions">
          {!readOnly && <button className="dialog-cancel" onClick={props.onClose}>Cancel</button>}
          <button className="primary-button" onClick={readOnly ? props.onClose : save}>{readOnly ? "Done" : actionLabel[props.id] ?? "Save changes"}</button>
        </div>
      </section>
    </div>
  );
}

const panelTitles: Record<SettingsPanelId, string> = {
  "food-units": "Food units", "height-units": "Height units", "weight-units": "Body weight unit", "energy-units": "Energy unit",
  "calorie-goal": "Your calorie goal", "calorie-adjustment": "Calorie adjustment", "macro-split": "Macro split", "meal-split": "Per-meal calorie share", "nutrient-goals": "Nutrient goals", "day-start": "Diary day start",
  "visible-nutrients": "Visible nutrients", theme: "Theme", accent: "Accent colour", language: "Language", "notification-time": "Reminder time",
  "invite-partner": "Invite a partner", "connected-partners": "Connected people", "partner-data": "Jamie’s shared dashboard", "sharing-permissions": "Sharing permissions",
  "add-food": "Add a custom food", "add-recipe": "Create a recipe", "saved-foods": "My custom foods", "saved-recipes": "My recipes",
};

function PanelContent({ id, settings, update, onSetDark, onToast }: PanelProps) {
  switch (id) {
    case "food-units": return <ChoiceList name="food-units" value={settings.foodUnits} options={["Metric (g, ml)", "Imperial (oz, fl oz)"]} onChange={(value) => update("foodUnits", value)} />;
    case "height-units": return <ChoiceList name="height-units" value={settings.heightUnits} options={["Metric (cm)", "Imperial (ft, in)"]} onChange={(value) => update("heightUnits", value)} />;
    case "weight-units": return <ChoiceList name="weight-units" value={settings.weightUnits} options={["Kilograms (kg)", "Pounds (lb)", "Stone (st)"]} onChange={(value) => update("weightUnits", value)} />;
    case "energy-units": return <ChoiceList name="energy-units" value={settings.energyUnits} options={["Kilocalories (kcal)", "Kilojoules (kJ)"]} onChange={(value) => update("energyUnits", value)} />;
    case "calorie-goal": return <CalorieExplanation />;
    case "calorie-adjustment": return <RangeEditor label="Daily adjustment" value={settings.calorieAdjustment} min={-500} max={500} step={25} unit="kcal" onChange={(value) => update("calorieAdjustment", value)} note="Applied after the estimated energy expenditure and weight-goal adjustment." />;
    case "macro-split": return <div className="slider-stack"><RangeEditor label="Carbohydrates" value={settings.carbs} min={5} max={80} unit="%" onChange={(value) => update("carbs", value)} /><RangeEditor label="Fat" value={settings.fat} min={5} max={60} unit="%" onChange={(value) => update("fat", value)} /><RangeEditor label="Protein" value={settings.protein} min={5} max={60} unit="%" onChange={(value) => update("protein", value)} /><p className={`split-total ${settings.carbs + settings.fat + settings.protein === 100 ? "valid" : ""}`}>Total: {settings.carbs + settings.fat + settings.protein}% · Aim for 100%</p></div>;
    case "meal-split": return <div className="slider-stack"><RangeEditor label="Breakfast" value={settings.breakfast} min={0} max={100} unit="%" onChange={(value) => update("breakfast", value)} /><RangeEditor label="Lunch" value={settings.lunch} min={0} max={100} unit="%" onChange={(value) => update("lunch", value)} /><RangeEditor label="Dinner" value={settings.dinner} min={0} max={100} unit="%" onChange={(value) => update("dinner", value)} /><RangeEditor label="Snack" value={settings.snack} min={0} max={100} unit="%" onChange={(value) => update("snack", value)} /></div>;
    case "nutrient-goals": return <NutrientInputs />;
    case "day-start": return <Field label="New diary day begins"><input type="time" value={settings.dayStart} onChange={(event) => update("dayStart", event.target.value)} /></Field>;
    case "visible-nutrients": return <CheckboxList options={["Fiber", "Sugar", "Saturated fat", "Sodium", "Potassium", "Vitamin C", "Iron", "Calcium"]} defaults={[0, 1, 3, 4]} />;
    case "theme": return <ChoiceList name="theme" value={settings.theme} options={["System default", "Light", "Dark"]} onChange={(value) => { update("theme", value); if (value !== "System default") onSetDark(value === "Dark"); }} />;
    case "accent": return <AccentPicker value={settings.accent} onChange={(value) => update("accent", value)} />;
    case "language": return <Field label="App language"><select value={settings.language} onChange={(event) => update("language", event.target.value)}>{["English", "Deutsch", "Čeština", "Italiano", "Polski", "Slovenčina", "Türkçe", "Українська", "中文"].map((language) => <option key={language}>{language}</option>)}</select></Field>;
    case "notification-time": return <Field label="Send my daily reminder at"><input type="time" value={settings.notificationTime} onChange={(event) => update("notificationTime", event.target.value)} /></Field>;
    case "invite-partner": return <InvitePartnerPanel onToast={onToast} />;
    case "connected-partners": return <ConnectedPartnersPanel onToast={onToast} />;
    case "partner-data": return <PartnerDashboard />;
    case "sharing-permissions": return <SharingPermissionsPanel />;
    case "add-food": return <AddFoodPanel />;
    case "add-recipe": return <AddRecipePanel onToast={onToast} />;
    case "saved-foods": return <SavedFoodsPanel onToast={onToast} />;
    case "saved-recipes": return <SavedRecipesPanel onToast={onToast} />;
  }
}

function ChoiceList({ name, value, options, onChange }: { name: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="choice-list">{options.map((option) => <label key={option} className={value === option ? "selected" : ""}><input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} /><span>{option}</span></label>)}</div>;
}

function RangeEditor({ label, value, min, max, step = 1, unit, note, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; note?: string; onChange: (value: number) => void }) {
  return <label className="range-editor"><span><strong>{label}</strong><output>{value > 0 && min < 0 ? "+" : ""}{value}{unit}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />{note && <small>{note}</small>}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="settings-field"><span>{label}</span>{children}</label>; }

function CheckboxList({ options, defaults }: { options: string[]; defaults: number[] }) {
  const [selected, setSelected] = useState(defaults);
  return <div className="checkbox-list">{options.map((option, index) => <label key={option}><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} /><span>{option}</span></label>)}</div>;
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

function CalorieExplanation() { return <div className="calorie-equation"><div><span>Base expenditure</span><strong>2,606 kcal</strong></div><b>+</b><div><span>Activity today</span><strong>249 kcal</strong></div><b>=</b><div className="total"><span>Today’s goal</span><strong>2,855 kcal</strong></div><InfoBox>Your goal updates with logged activity. The production app uses your profile and IOM 2005 energy equations.</InfoBox></div>; }

function NutrientInputs() { return <div className="nutrient-inputs">{[["Fiber", "30", "g"], ["Sodium", "2300", "mg"], ["Potassium", "3500", "mg"], ["Vitamin C", "90", "mg"], ["Iron", "18", "mg"], ["Calcium", "1000", "mg"]].map(([label, value, unit]) => <label key={label}><span>{label}</span><div><input defaultValue={value} inputMode="decimal" /><b>{unit}</b></div></label>)}</div>; }

function InvitePartnerPanel({ onToast }: { onToast: (message: string) => void }) {
  return <div className="panel-stack">
    <div className="invite-hero"><span className="icon-badge green"><UserPlus /></span><div><strong>Share progress, not passwords</strong><p>Your partner gets their own private invitation and only sees the information you choose.</p></div></div>
    <Field label="Partner name"><input placeholder="e.g. Jamie" /></Field>
    <Field label="Email address"><div className="input-with-icon"><Mail size={17} /><input type="email" placeholder="jamie@example.com" /></div></Field>
    <Field label="Relationship"><select defaultValue="Partner"><option>Partner</option><option>Family member</option><option>Coach</option><option>Healthcare professional</option></select></Field>
    <CheckboxList options={["Today’s calorie and macro totals", "Logged meals and recipes", "Weight and progress trends"]} defaults={[0, 1, 2]} />
    <button className="secondary-button panel-button" onClick={() => onToast("Demo invitation link copied.")}><Copy size={17} /> Copy invite link</button>
  </div>;
}

function ConnectedPartnersPanel({ onToast }: { onToast: (message: string) => void }) {
  return <div className="people-list">
    <div className="person-card"><span className="person-avatar">JD</span><div><strong>Jamie Davis</strong><span>Partner · Connected Aug 28</span><small><i /> Active now</small></div><button onClick={() => onToast("Jamie’s access settings opened.")}>Manage</button></div>
    <div className="person-card pending"><span className="person-avatar">MS</span><div><strong>Morgan Smith</strong><span>Coach · Invite sent yesterday</span><small>Awaiting response</small></div><button onClick={() => onToast("Invitation sent again.")}>Resend</button></div>
  </div>;
}

function PartnerDashboard() {
  const meals = [["Breakfast", "Greek yoghurt bowl", "438 kcal"], ["Lunch", "Chicken grain bowl", "612 kcal"], ["Snack", "Apple & peanut butter", "224 kcal"]];
  return <div className="partner-dashboard">
    <div className="partner-heading"><span className="person-avatar">JD</span><div><strong>Jamie Davis</strong><span>Shared today at 2:42 PM</span></div><span className="sharing-live"><i /> Sharing</span></div>
    <div className="partner-metrics"><div><span>Calories</span><strong>1,840</strong><small>of 2,200 kcal</small><i><b style={{ width: "84%" }} /></i></div><div><span>Protein</span><strong>96 g</strong><small>of 120 g</small><i><b style={{ width: "80%" }} /></i></div><div><span>Water</span><strong>1.6 L</strong><small>of 2.2 L</small><i><b style={{ width: "73%" }} /></i></div></div>
    <div className="shared-meals"><h3>Meals shared today</h3>{meals.map(([type, name, kcal]) => <div key={type}><span className="icon-badge green"><Utensils size={17} /></span><p><small>{type}</small><strong>{name}</strong></p><b>{kcal}</b></div>)}</div>
    <InfoBox>Jamie controls what appears here. Private notes and unshared measurements stay hidden.</InfoBox>
  </div>;
}

function SharingPermissionsPanel() {
  return <div className="panel-stack">
    <InfoBox>These permissions apply to Jamie. You can change or revoke access at any time.</InfoBox>
    <CheckboxList options={["Daily calorie total", "Macro totals", "Meal names and portions", "Water intake", "Activity", "Weight trend", "Goal progress"]} defaults={[0, 1, 2, 3, 4, 6]} />
    <label className="check-line"><input type="checkbox" defaultChecked /> Notify me when Jamie views my dashboard</label>
  </div>;
}

function AddFoodPanel() {
  return <div className="food-form panel-stack">
    <div className="form-row"><Field label="Food name"><input placeholder="e.g. Homemade granola" /></Field><Field label="Brand (optional)"><input placeholder="Homemade" /></Field></div>
    <div className="form-row"><Field label="Serving amount"><input type="number" defaultValue="100" /></Field><Field label="Serving unit"><select defaultValue="g"><option>g</option><option>ml</option><option>oz</option><option>serving</option><option>piece</option></select></Field></div>
    <h3 className="form-subtitle">Nutrition per serving</h3>
    <div className="nutrition-form-grid"><MetricInput label="Calories" unit="kcal" /><MetricInput label="Carbs" unit="g" /><MetricInput label="Fat" unit="g" /><MetricInput label="Protein" unit="g" /><MetricInput label="Fiber" unit="g" /><MetricInput label="Sugar" unit="g" /></div>
    <label className="check-line"><input type="checkbox" defaultChecked /> Save to my foods for quick logging</label>
  </div>;
}

function MetricInput({ label, unit }: { label: string; unit: string }) {
  return <label><span>{label}</span><div><input type="number" min="0" placeholder="0" /><b>{unit}</b></div></label>;
}

function AddRecipePanel({ onToast }: { onToast: (message: string) => void }) {
  const [ingredients, setIngredients] = useState(["Brown rice · 200 g", "Salmon fillet · 250 g", "Broccoli · 180 g"]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("100");
  const [customUnit, setCustomUnit] = useState("g");
  const foods = [
    { emoji: "🥑", name: "Avocado", source: "USDA", kcal: 160 },
    { emoji: "🍗", name: "Chicken breast", source: "USDA", kcal: 165 },
    { emoji: "🍅", name: "Cherry tomatoes", source: "Open Food Facts", kcal: 18 },
    { emoji: "🥛", name: "Greek yoghurt", source: "Open Food Facts", kcal: 97 },
    { emoji: "🫒", name: "Olive oil", source: "USDA", kcal: 884 },
  ];
  const results = foods.filter((food) => food.name.toLowerCase().includes(query.trim().toLowerCase()));
  const addIngredient = (ingredient: string) => {
    setIngredients((current) => [...current, ingredient]);
    onToast("Ingredient added to the recipe.");
  };
  const addCustomIngredient = () => {
    if (!customName.trim()) return;
    addIngredient(`${customName.trim()} · ${customAmount || "100"} ${customUnit}`);
    setCustomName("");
    setCustomOpen(false);
  };
  if (pickerOpen) {
    return <section className="ingredient-picker ingredient-picker-view">
      <div className="ingredient-picker-head"><div><span className="eyebrow">Ingredient library</span><h3>Add an ingredient</h3><p>Search the food library or create an ingredient of your own.</p></div><button aria-label="Back to recipe" onClick={() => { setPickerOpen(false); setCustomOpen(false); }}><ChevronLeft size={18} /></button></div>
      <label className="ingredient-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods, brands or ingredients" /><kbd>⌘ K</kbd></label>
      <div className="ingredient-results">
        {results.length > 0 ? results.map((food) => <button key={food.name} onClick={() => addIngredient(`${food.name} · 100 g`)}><span>{food.emoji}</span><span><strong>{food.name}</strong><small>{food.source} · {food.kcal} kcal / 100 g</small></span><i><Plus size={16} /></i></button>) : <div className="ingredient-empty"><Search size={20} /><strong>No foods found</strong><span>Try another name or create your own ingredient below.</span></div>}
      </div>
      {!customOpen ? <button className="custom-ingredient-trigger" onClick={() => setCustomOpen(true)}><span className="icon-badge green"><Plus size={19} /></span><span><strong>Create your own ingredient</strong><small>Add something that is not in the search results</small></span><ChevronRight size={18} /></button> : <div className="custom-ingredient-form">
        <div className="custom-ingredient-title"><div><strong>New custom ingredient</strong><span>Add the basic details for this recipe.</span></div><button onClick={() => setCustomOpen(false)}>Cancel</button></div>
        <Field label="Ingredient name"><input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="e.g. Family tomato sauce" /></Field>
        <div className="custom-ingredient-grid"><Field label="Amount"><input type="number" min="0" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} /></Field><Field label="Unit"><select value={customUnit} onChange={(event) => setCustomUnit(event.target.value)}><option>g</option><option>ml</option><option>oz</option><option>piece</option><option>serving</option></select></Field><Field label="Calories"><input type="number" min="0" placeholder="0" /></Field></div>
        <button className="primary-button custom-add-button" disabled={!customName.trim()} onClick={addCustomIngredient}><Plus size={17} /> Add to recipe</button>
      </div>}
      <button className="ingredient-done" onClick={() => { setPickerOpen(false); setCustomOpen(false); }}>← Back to recipe · {ingredients.length} ingredients</button>
    </section>;
  }
  return <div className="recipe-form panel-stack">
    <div className="form-row"><Field label="Recipe name"><input placeholder="e.g. Weeknight salmon bowl" /></Field><Field label="Servings"><input type="number" defaultValue="2" min="1" /></Field></div>
    <Field label="Description"><textarea placeholder="Optional notes or preparation details" /></Field>
    <div className="ingredient-head"><h3>Ingredients</h3><span>{ingredients.length} items</span></div>
    <div className="ingredient-list">{ingredients.map((ingredient, index) => <div key={`${ingredient}-${index}`}><span>{index + 1}</span><strong>{ingredient}</strong><button aria-label={`Remove ${ingredient}`} onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}</div>
    <button className="secondary-button panel-button" onClick={() => setPickerOpen(true)}><Plus size={17} /> Add ingredient</button>
    <div className="recipe-summary"><span>Per serving</span><strong>547 kcal</strong><small>Carbs 48 g · Fat 22 g · Protein 38 g</small></div>
  </div>;
}

function SavedFoodsPanel({ onToast }: { onToast: (message: string) => void }) {
  const foods = [["HG", "Homemade granola", "468 kcal · 100 g"], ["PS", "Protein smoothie", "320 kcal · 450 ml"], ["SD", "Sourdough toast", "126 kcal · 1 slice"], ["TD", "Tahini dressing", "88 kcal · 1 tbsp"]];
  return <div className="library-list">{foods.map(([initials, name, detail]) => <div key={name}><span className="food-avatar">{initials}</span><p><strong>{name}</strong><small>{detail}</small></p><button onClick={() => onToast(`${name} editor opened.`)}>Edit</button></div>)}</div>;
}

function SavedRecipesPanel({ onToast }: { onToast: (message: string) => void }) {
  const recipes = [["Salmon grain bowl", "2 servings · 547 kcal each"], ["Overnight oats", "1 serving · 412 kcal"], ["Lentil tomato soup", "4 servings · 286 kcal each"]];
  return <div className="library-list recipe-library">{recipes.map(([name, detail], index) => <div key={name}><span className={`food-avatar recipe-${index}`}><ChefHat size={19} /></span><p><strong>{name}</strong><small>{detail}</small></p><button onClick={() => onToast(`${name} recipe opened.`)}>Open</button></div>)}</div>;
}

function InfoBox({ children }: { children: React.ReactNode }) { return <div className="info-box"><Info size={17} /><p>{children}</p></div>; }
