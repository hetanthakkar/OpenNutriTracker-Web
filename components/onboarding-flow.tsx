"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CircleUserRound,
  Gauge,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  Mars,
  Minus,
  Moon,
  Palette,
  Scale,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Venus,
} from "lucide-react";
import { DateOfBirthFields } from "./date-of-birth-fields";
import {
  automaticNutritionPlan,
  suggestedWeeklyWeightChangeKg,
  type NutritionGoal,
} from "@/lib/onboarding-plan";
import {
  formatEnergy,
  heightAmountToCm,
  heightDisplayValue,
  heightUnitLabel,
  type HeightUnit,
  type WeightUnit,
  weightAmountToKg,
  weightDisplayValue,
  weightUnitLabel,
} from "@/lib/user-preferences";
import {
  waterAmountToMl,
  waterDisplayValue,
  waterUnitLabel,
  type WaterUnit,
} from "@/lib/water-units";
import { showWaterTracking } from "@/lib/ui-features";

export type OnboardingInitialData = {
  suggestedName: string;
  profile: Partial<{
    displayName: string;
    heightCm: number | null;
    dateOfBirth: string | null;
    energyEquationSex: "female" | "male" | null;
    targetWeightKg: number | null;
    activityLevel: string;
    goal: string;
    weeklyRateKg: number | null;
    waterGoalMl: number;
  }>;
  preferences: Record<string, unknown>;
  currentWeightKg: number | null;
};

export type OnboardingResult = {
  displayName: string;
  waterGoalMl: number;
  currentWeightKg: number | null;
  preferences: Record<string, unknown>;
};

type OnboardingForm = {
  displayName: string;
  dateOfBirth: string;
  energyEquationSex: "" | "female" | "male";
  heightCm: string;
  currentWeightKg: string;
  targetWeightKg: string;
  activityLevel: string;
  goal: NutritionGoal;
  weeklyRateKg: string;
  waterGoalMl: string;
  foodUnits: string;
  heightUnits: string;
  weightUnits: string;
  energyUnits: string;
  waterUnit: WaterUnit;
  waterQuickAddMl: string;
  dayStart: string;
  theme: string;
  accent: string;
  language: string;
  showActivity: boolean;
  showMacros: boolean;
  showMicros: boolean;
  notifications: boolean;
  notificationTime: string;
  homeQuickStats: boolean;
  homeEnergy: boolean;
  homeScores: boolean;
  homeMeals: boolean;
  homeStreak: boolean;
  homeActivity: boolean;
  homeHabits: boolean;
  homeTargets: boolean;
};

const steps = [
  { label: "About you", title: "Let’s get to know you", description: "A few basics help us create a more useful starting estimate.", icon: UserRound },
  { label: "Measurements", title: "Add your measurements", description: "These details help us estimate a realistic daily energy range.", icon: Scale },
  { label: "Your goal", title: "What are you working toward?", description: "Choose your goal and the pace that feels realistic for you.", icon: Target },
  { label: "Your plan", title: "Your starting nutrition plan", description: "Here’s how your choices translate into a daily energy target.", icon: Gauge },
  { label: "Preferences", title: "Make the app feel familiar", description: "Set the units, language, and appearance you prefer.", icon: Palette },
  { label: "Final touches", title: "Set up your daily experience", description: "Choose reminders and what you want to see on Home.", icon: Sparkles },
] as const;

const homeSections = [
  ["homeQuickStats", "Quick stats", "Weight and calories"],
  ["homeEnergy", "Calorie budget", "Your daily energy progress"],
  ["homeScores", "Nutrition scores", "At-a-glance food quality"],
  ["homeMeals", "Today’s meals", "Fast access to meal logging"],
  ["homeStreak", "Tracking streak", "Keep your momentum visible"],
  ["homeActivity", "Activity", "Movement and workouts"],
  ["homeHabits", "Daily habits", "Routine goals"],
  ["homeTargets", "Nutrition targets", "Detailed nutrient progress"],
] as const;

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function initialForm(data: OnboardingInitialData): OnboardingForm {
  const profile = data.profile;
  const preferences = data.preferences;
  const name = textValue(profile.displayName, "My profile");
  const goal = profile.goal === "lose_weight" || profile.goal === "gain_weight" ? profile.goal : "maintain_weight";
  const defaultRate = suggestedWeeklyWeightChangeKg(goal, data.currentWeightKg);

  return {
    displayName: name === "My profile" ? data.suggestedName || "" : name,
    dateOfBirth: textValue(profile.dateOfBirth, ""),
    energyEquationSex: profile.energyEquationSex === "female" || profile.energyEquationSex === "male" ? profile.energyEquationSex : "",
    heightCm: numberValue(profile.heightCm, ""),
    currentWeightKg: data.currentWeightKg === null ? "" : numberValue(data.currentWeightKg, ""),
    targetWeightKg: numberValue(profile.targetWeightKg, ""),
    activityLevel: textValue(profile.activityLevel, "active"),
    goal,
    weeklyRateKg: numberValue(profile.weeklyRateKg, String(defaultRate)),
    waterGoalMl: numberValue(profile.waterGoalMl, "1900"),
    foodUnits: textValue(preferences.foodUnits, "Metric (g, ml)"),
    heightUnits: textValue(preferences.heightUnits, "Metric (cm)"),
    weightUnits: textValue(preferences.weightUnits, "Kilograms (kg)"),
    energyUnits: textValue(preferences.energyUnits, "Calories (cal)"),
    waterUnit: preferences.waterUnit === "fl_oz" ? "fl_oz" : "ml",
    waterQuickAddMl: numberValue(preferences.waterQuickAddMl, "250"),
    dayStart: textValue(preferences.dayStart, "00:00"),
    theme: textValue(preferences.theme, "System default"),
    accent: textValue(preferences.accent, "#0e7a4d"),
    language: textValue(preferences.language, "English"),
    showActivity: booleanValue(preferences.showActivity, true),
    showMacros: booleanValue(preferences.showMacros, true),
    showMicros: booleanValue(preferences.showMicros, true),
    notifications: booleanValue(preferences.notifications, true),
    notificationTime: textValue(preferences.notificationTime, "19:00"),
    homeQuickStats: booleanValue(preferences.homeQuickStats, true),
    homeEnergy: booleanValue(preferences.homeEnergy, true),
    homeScores: booleanValue(preferences.homeScores, true),
    homeMeals: booleanValue(preferences.homeMeals, true),
    homeStreak: booleanValue(preferences.homeStreak, true),
    homeActivity: booleanValue(preferences.homeActivity, true),
    homeHabits: booleanValue(preferences.homeHabits, true),
    homeTargets: booleanValue(preferences.homeTargets, true),
  };
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: string, fallback: number) {
  return optionalNumber(value) ?? fallback;
}

function selectedWeightUnit(value: string): WeightUnit {
  return value === "Pounds (lb)" ? "lb" : value === "Stone (st)" ? "st" : "kg";
}

function selectedHeightUnit(value: string): HeightUnit {
  return value === "Imperial (ft, in)" ? "ft_in" : "cm";
}

function displayNumber(value: string, convert: (amount: number) => number, fractionDigits = 1) {
  const parsed = optionalNumber(value);
  if (parsed === null) return "";
  return String(Number(convert(parsed).toFixed(fractionDigits)));
}

function canonicalNumber(value: string, convert: (amount: number) => number) {
  if (!value.trim()) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(convert(parsed)) : value;
}

function formatRate(rateKg: number, unit: WeightUnit) {
  const digits = unit === "lb" ? 1 : 2;
  return `${Number(weightDisplayValue(Math.abs(rateKg), unit).toFixed(digits))} ${weightUnitLabel(unit)}`;
}

async function responseMessage(response: Response, fallback: string) {
  const data = await response.json() as { message?: string };
  if (!response.ok) throw new Error(data.message ?? fallback);
}

function ChoiceCard({
  checked,
  description,
  icon,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  description?: string;
  icon: ReactNode;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label className={`onboarding-choice-card ${checked ? "selected" : ""}`}>
      <input className="sr-only" type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="onboarding-choice-icon">{icon}</span>
      <span className="onboarding-choice-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="onboarding-choice-indicator" aria-hidden="true" />
    </label>
  );
}

function ToggleCard({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="onboarding-toggle-card">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="onboarding-switch" aria-hidden="true" />
    </label>
  );
}

export function OnboardingFlow({
  data,
  onComplete,
}: {
  data: OnboardingInitialData;
  onComplete: (result: OnboardingResult) => void;
}) {
  const [form, setForm] = useState(() => initialForm(data));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const details = steps[step];
  const weightUnit = selectedWeightUnit(form.weightUnits);
  const heightUnit = selectedHeightUnit(form.heightUnits);
  const energyUnit = form.energyUnits === "Kilojoules (kJ)" ? "kJ" : "kcal";
  const currentWeightKg = optionalNumber(form.currentWeightKg);
  const targetWeightKg = optionalNumber(form.targetWeightKg);
  const automaticPlan = automaticNutritionPlan({
    goal: form.goal,
    weeklyRateKg: optionalNumber(form.weeklyRateKg),
    currentWeightKg,
    heightCm: optionalNumber(form.heightCm),
    dateOfBirth: form.dateOfBirth,
    sex: form.energyEquationSex,
    activityLevel: form.activityLevel,
  });
  const rateMagnitudeKg = Math.abs(automaticPlan.weeklyRateKg);
  const rateMaximumKg = form.goal === "gain_weight" ? 0.5 : 1;
  const targetDifferenceKg = currentWeightKg !== null && targetWeightKg !== null
    ? targetWeightKg - currentWeightKg
    : null;
  const goalMatchesTarget = targetDifferenceKg !== null && (
    (form.goal === "lose_weight" && targetDifferenceKg < 0)
    || (form.goal === "gain_weight" && targetDifferenceKg > 0)
  );
  const estimatedWeeks = goalMatchesTarget && rateMagnitudeKg > 0
    ? Math.ceil(Math.abs(targetDifferenceKg ?? 0) / rateMagnitudeKg)
    : null;
  const dailyAdjustmentKcal = automaticPlan.dailyEnergyAdjustmentKcal ?? 0;
  const adjustmentOperator = dailyAdjustmentKcal < 0 ? "−" : dailyAdjustmentKcal > 0 ? "+" : "±";
  const adjustmentLabel = dailyAdjustmentKcal < 0 ? "deficit" : dailyAdjustmentKcal > 0 ? "surplus" : "adjustment";

  const changeGoal = (goal: NutritionGoal) => {
    const weeklyRateKg = suggestedWeeklyWeightChangeKg(goal, currentWeightKg)
      || (goal === "lose_weight" ? -0.5 : goal === "gain_weight" ? 0.25 : 0);
    setForm((current) => ({ ...current, goal, weeklyRateKg: String(weeklyRateKg) }));
  };

  const changeRate = (magnitudeKg: number) => {
    update("weeklyRateKg", String(form.goal === "lose_weight" ? -magnitudeKg : magnitudeKg));
  };

  const next = () => {
    setError("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const back = () => {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const profilePayload = {
      displayName: form.displayName.trim() || undefined,
      heightCm: optionalNumber(form.heightCm),
      dateOfBirth: form.dateOfBirth || null,
      energyEquationSex: form.energyEquationSex || null,
      targetWeightKg,
      activityLevel: form.activityLevel,
      goal: form.goal,
      weeklyRateKg: automaticPlan.weeklyRateKg,
      waterGoalMl: Math.round(requiredNumber(form.waterGoalMl, 1900)),
    };
    const preferences = {
      calorieAdjustment: 0,
      carbs: automaticPlan.carbsPct,
      fat: automaticPlan.fatPct,
      protein: automaticPlan.proteinPct,
      breakfast: 25,
      lunch: 35,
      dinner: 30,
      snack: 10,
      foodUnits: form.foodUnits,
      heightUnits: form.heightUnits,
      weightUnits: form.weightUnits,
      energyUnits: form.energyUnits,
      waterUnit: form.waterUnit,
      waterQuickAddMl: Math.round(requiredNumber(form.waterQuickAddMl, 250)),
      dayStart: form.dayStart,
      theme: form.theme,
      accent: form.accent,
      language: form.language,
      showActivity: form.showActivity,
      showMacros: form.showMacros,
      showMicros: form.showMicros,
      notifications: form.notifications,
      notificationTime: form.notificationTime,
      homeQuickStats: form.homeQuickStats,
      homeEnergy: form.homeEnergy,
      homeScores: form.homeScores,
      homeMeals: form.homeMeals,
      homeStreak: form.homeStreak,
      homeActivity: form.homeActivity,
      homeHabits: form.homeHabits,
      homeTargets: form.homeTargets,
      onboardingComplete: true,
    };

    try {
      const profileRequest = fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload),
      });
      const weightRequest = currentWeightKg === null
        ? Promise.resolve(null)
        : fetch("/api/weights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weightKg: currentWeightKg }),
          });
      const [profileResponse, weightResponse] = await Promise.all([profileRequest, weightRequest]);
      await responseMessage(profileResponse, "Could not save your profile.");
      if (weightResponse) await responseMessage(weightResponse, "Could not save your weight.");

      const preferenceResponse = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      await responseMessage(preferenceResponse, "Could not save your preferences.");
      onComplete({
        displayName: form.displayName.trim() || data.suggestedName || "My profile",
        waterGoalMl: profilePayload.waterGoalMl,
        currentWeightKg,
        preferences,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not finish setting up your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop onboarding-backdrop" role="presentation">
      <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <aside className="onboarding-rail" aria-label="Setup progress">
          <div className="onboarding-brand">
            <span><Leaf size={21} /></span>
            <div><strong>OpenNutriTracker</strong><small>Personal setup</small></div>
          </div>
          <ol>
            {steps.map((item, index) => {
              const StepIcon = item.icon;
              return (
                <li className={index === step ? "active" : index < step ? "complete" : ""} key={item.label} aria-current={index === step ? "step" : undefined}>
                  <span>{index < step ? <Check size={16} /> : <StepIcon size={17} />}</span>
                  <div><small>Step {index + 1}</small><strong>{item.label}</strong></div>
                </li>
              );
            })}
          </ol>
          <p><Sparkles size={15} /> Everything can be changed later in Menu.</p>
        </aside>

        <div className="onboarding-main">
          <header className="onboarding-mobile-head">
            <div className="onboarding-mobile-brand"><Leaf size={19} /><strong>OpenNutriTracker</strong></div>
            <span>{step + 1} of {steps.length}</span>
          </header>
          <div className="onboarding-progress" aria-label={`Onboarding step ${step + 1} of ${steps.length}`}>
            {steps.map((item, index) => <span className={index <= step ? "active" : ""} key={item.label} />)}
          </div>

          <div className="onboarding-content">
            <header className="onboarding-step-heading">
              <span className="eyebrow">Step {step + 1} of {steps.length} · {details.label}</span>
              <h1 id="onboarding-title">{details.title}</h1>
              <p>{details.description}</p>
            </header>

            {step === 0 ? (
              <div className="onboarding-fields onboarding-basics">
                <label className="onboarding-name-field">
                  <span>Your name</span>
                  <input autoFocus value={form.displayName} maxLength={80} placeholder="e.g. Alex" onChange={(event) => update("displayName", event.target.value)} />
                </label>
                <fieldset className="onboarding-question date-of-birth-field">
                  <legend>Date of birth</legend>
                  <p className="onboarding-question-note">Used only to estimate your resting energy needs.</p>
                  <DateOfBirthFields value={form.dateOfBirth} onChange={(value) => update("dateOfBirth", value ?? "")} />
                </fieldset>
                <fieldset className="onboarding-question onboarding-sex-question" aria-describedby="energy-sex-note">
                  <legend>Sex used for the energy estimate</legend>
                  <p className="onboarding-question-note" id="energy-sex-note">This is used in the Mifflin–St Jeor equation. It does not affect how we address you.</p>
                  <div className="onboarding-sex-choices">
                    <ChoiceCard checked={form.energyEquationSex === "female"} icon={<Venus size={21} />} label="Female" name="energy-sex" value="female" onChange={() => update("energyEquationSex", "female")} />
                    <ChoiceCard checked={form.energyEquationSex === "male"} icon={<Mars size={21} />} label="Male" name="energy-sex" value="male" onChange={() => update("energyEquationSex", "male")} />
                    <ChoiceCard checked={form.energyEquationSex === ""} icon={<CircleUserRound size={21} />} label="Prefer not to say" name="energy-sex" value="" onChange={() => update("energyEquationSex", "")} />
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="onboarding-fields onboarding-measurements-step">
                <div className="onboarding-unit-row">
                  <label><span>Height unit</span><select value={form.heightUnits} onChange={(event) => update("heightUnits", event.target.value)}><option>Metric (cm)</option><option>Imperial (ft, in)</option></select></label>
                  <label><span>Weight unit</span><select value={form.weightUnits} onChange={(event) => update("weightUnits", event.target.value)}><option>Kilograms (kg)</option><option>Pounds (lb)</option><option>Stone (st)</option></select></label>
                </div>
                <div className="onboarding-field-grid onboarding-measurements">
                  <label><span>Height <em>{heightUnitLabel(heightUnit)}</em></span><input type="number" min={heightUnit === "ft_in" ? "2.6" : "80"} max={heightUnit === "ft_in" ? "8.2" : "250"} step={heightUnit === "ft_in" ? "0.1" : "1"} value={displayNumber(form.heightCm, (value) => heightDisplayValue(value, heightUnit), heightUnit === "ft_in" ? 2 : 0)} placeholder={heightUnit === "ft_in" ? "5.7" : "175"} onChange={(event) => update("heightCm", canonicalNumber(event.target.value, (value) => heightAmountToCm(value, heightUnit)))} /></label>
                  <label><span>Current weight <em>{weightUnitLabel(weightUnit)}</em></span><input type="number" min={weightUnit === "kg" ? "20" : weightUnit === "lb" ? "44" : "3"} max={weightUnit === "kg" ? "500" : weightUnit === "lb" ? "1100" : "79"} step="0.1" value={displayNumber(form.currentWeightKg, (value) => weightDisplayValue(value, weightUnit))} placeholder={weightUnit === "kg" ? "70" : weightUnit === "lb" ? "154" : "11"} onChange={(event) => update("currentWeightKg", canonicalNumber(event.target.value, (value) => weightAmountToKg(value, weightUnit)))} /></label>
                  <label><span>Target weight <em>{weightUnitLabel(weightUnit)} · optional</em></span><input type="number" min={weightUnit === "kg" ? "20" : weightUnit === "lb" ? "44" : "3"} max={weightUnit === "kg" ? "500" : weightUnit === "lb" ? "1100" : "79"} step="0.1" value={displayNumber(form.targetWeightKg, (value) => weightDisplayValue(value, weightUnit))} placeholder={weightUnit === "kg" ? "65" : weightUnit === "lb" ? "143" : "10"} onChange={(event) => update("targetWeightKg", canonicalNumber(event.target.value, (value) => weightAmountToKg(value, weightUnit)))} /></label>
                  <label><span>Activity level</span><select value={form.activityLevel} onChange={(event) => update("activityLevel", event.target.value)}><option value="sedentary">Sedentary</option><option value="light">Lightly active</option><option value="active">Active</option><option value="very_active">Very active</option></select></label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="onboarding-fields onboarding-goals">
                <fieldset className="onboarding-question">
                  <legend>Your goal</legend>
                  <div className="onboarding-goal-choices">
                    <ChoiceCard checked={form.goal === "lose_weight"} icon={<TrendingDown size={21} />} label="Lose weight" description="Create a calorie deficit" name="nutrition-goal" value="lose_weight" onChange={() => changeGoal("lose_weight")} />
                    <ChoiceCard checked={form.goal === "maintain_weight"} icon={<Minus size={21} />} label="Maintain" description="Stay around your current weight" name="nutrition-goal" value="maintain_weight" onChange={() => changeGoal("maintain_weight")} />
                    <ChoiceCard checked={form.goal === "gain_weight"} icon={<TrendingUp size={21} />} label="Gain weight" description="Create a calorie surplus" name="nutrition-goal" value="gain_weight" onChange={() => changeGoal("gain_weight")} />
                  </div>
                </fieldset>

                {form.goal !== "maintain_weight" ? (
                  <section className="onboarding-rate-card" aria-labelledby="weekly-rate-title">
                    <div className="onboarding-rate-head">
                      <div><span id="weekly-rate-title">Weekly {form.goal === "lose_weight" ? "weight loss" : "weight gain"}</span><small>We’ll calculate your calorie target from this pace.</small></div>
                      <output htmlFor="weekly-rate">{formatRate(rateMagnitudeKg, weightUnit)}<small> / week</small></output>
                    </div>
                    <input id="weekly-rate" type="range" min="0.1" max={rateMaximumKg} step="0.05" value={Math.min(rateMaximumKg, Math.max(0.1, rateMagnitudeKg))} onChange={(event) => changeRate(Number(event.target.value))} />
                    <div className="onboarding-rate-scale"><span>Gentle<br /><b>{formatRate(0.1, weightUnit)}</b></span><span>Faster<br /><b>{formatRate(rateMaximumKg, weightUnit)}</b></span></div>
                    {estimatedWeeks !== null ? <p className="onboarding-eta"><Target size={15} /> At this pace, your target is about <strong>{estimatedWeeks} weeks</strong> away.</p> : null}
                    <p className="onboarding-rate-note">A gradual pace is usually easier to sustain. Your calculated intake will never be set below 1,200 calories.</p>
                  </section>
                ) : (
                  <div className="onboarding-maintain-note"><Scale size={18} /><span><strong>Maintenance selected</strong><small>Your starting target will match your estimated daily expenditure.</small></span></div>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="onboarding-fields onboarding-plan-step">
                {automaticPlan.ready ? (
                  <section className="onboarding-plan-preview">
                    <div className="onboarding-plan-hero">
                      <span className="onboarding-plan-icon"><Leaf size={22} /></span>
                      <span className="eyebrow">Daily calorie target</span>
                      <strong>{formatEnergy(automaticPlan.calorieGoalKcal!, energyUnit)}</strong>
                      <p>Built from your estimated daily expenditure and selected weekly pace.</p>
                    </div>
                    <div className="onboarding-plan-equation" aria-label="Calorie target calculation">
                      <div><span>Estimated expenditure</span><strong>{formatEnergy(automaticPlan.estimatedTdeeKcal!, energyUnit)}</strong></div>
                      <span aria-hidden="true">{adjustmentOperator}</span>
                      <div><span>Daily {adjustmentLabel}</span><strong>{formatEnergy(Math.abs(dailyAdjustmentKcal), energyUnit)}</strong></div>
                      <span aria-hidden="true">=</span>
                      <div className="result"><span>Your target</span><strong>{formatEnergy(automaticPlan.calorieGoalKcal!, energyUnit)}</strong></div>
                    </div>
                    <div className="onboarding-plan-details">
                      <div><span>Weekly pace</span><strong>{automaticPlan.weeklyRateKg === 0 ? "Maintain" : `${formatRate(automaticPlan.weeklyRateKg, weightUnit)} ${automaticPlan.weeklyRateKg < 0 ? "loss" : "gain"}`}</strong></div>
                      <div><span>Macro split</span><strong>{automaticPlan.carbsPct}% carbs · {automaticPlan.fatPct}% fat · {automaticPlan.proteinPct}% protein</strong></div>
                    </div>
                    {automaticPlan.targetWasClamped ? <p className="onboarding-plan-warning">{form.goal === "lose_weight" ? "The 1,200-calorie safety floor limits the full deficit implied by your selected pace. Consider choosing a gentler weekly goal." : "The 5,000-calorie upper limit caps the full surplus implied by your selected pace."}</p> : null}
                  </section>
                ) : (
                  <section className="onboarding-plan-empty">
                    <span><Gauge size={25} /></span>
                    <h2>Your plan is almost ready</h2>
                    <p>Add {automaticPlan.missingFields.join(", ")} so we can calculate a personalized calorie target. You can still finish setup and add these later.</p>
                    <button type="button" onClick={() => setStep(automaticPlan.missingFields.some((field) => field === "height" || field === "current weight") ? 1 : 0)}><ArrowLeft size={15} /> Add missing details</button>
                  </section>
                )}
                <div className="onboarding-plan-note"><Sparkles size={16} /><p><strong>A starting point, not a prescription.</strong> As you log food and weight consistently, OpenNutriTracker learns from your real expenditure and refines the estimate.</p></div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="onboarding-fields onboarding-preferences">
                <section className="onboarding-form-section">
                  <div className="onboarding-section-title"><span><Scale size={18} /></span><div><h2>Units & diary</h2><p>Choose how measurements appear throughout the app.</p></div></div>
                  <div className="onboarding-field-grid">
                    <label><span>Food units</span><select value={form.foodUnits} onChange={(event) => update("foodUnits", event.target.value)}><option>Metric (g, ml)</option><option>Imperial (oz, fl oz)</option></select></label>
                    <label><span>Energy unit</span><select value={form.energyUnits} onChange={(event) => update("energyUnits", event.target.value)}><option>Calories (cal)</option><option>Kilojoules (kJ)</option></select></label>
                    {showWaterTracking ? <><label><span>Water display</span><select value={form.waterUnit} onChange={(event) => update("waterUnit", event.target.value as WaterUnit)}><option value="ml">Millilitres (ml)</option><option value="fl_oz">US fluid ounces (fl oz)</option></select></label>
                    <label><span>Daily water goal <em>{waterUnitLabel(form.waterUnit)}</em></span><input type="number" min={form.waterUnit === "fl_oz" ? "8" : "250"} max={form.waterUnit === "fl_oz" ? "338" : "10000"} step={form.waterUnit === "fl_oz" ? "1" : "50"} value={displayNumber(form.waterGoalMl, (value) => waterDisplayValue(value, form.waterUnit), form.waterUnit === "fl_oz" ? 1 : 0)} onChange={(event) => update("waterGoalMl", canonicalNumber(event.target.value, (value) => waterAmountToMl(value, form.waterUnit)))} /></label>
                    <label><span>Quick-add water <em>{waterUnitLabel(form.waterUnit)}</em></span><input type="number" min={form.waterUnit === "fl_oz" ? "0.3" : "10"} max={form.waterUnit === "fl_oz" ? "169" : "5000"} step={form.waterUnit === "fl_oz" ? "1" : "10"} value={displayNumber(form.waterQuickAddMl, (value) => waterDisplayValue(value, form.waterUnit), form.waterUnit === "fl_oz" ? 1 : 0)} onChange={(event) => update("waterQuickAddMl", canonicalNumber(event.target.value, (value) => waterAmountToMl(value, form.waterUnit)))} /></label></> : null}
                    <label><span>Diary day starts at</span><input type="time" value={form.dayStart} onChange={(event) => update("dayStart", event.target.value)} /></label>
                  </div>
                </section>
                <section className="onboarding-form-section">
                  <div className="onboarding-section-title"><span><Moon size={18} /></span><div><h2>Appearance</h2><p>These choices apply as soon as setup is complete.</p></div></div>
                  <div className="onboarding-field-grid">
                    <label><span>Theme</span><select value={form.theme} onChange={(event) => update("theme", event.target.value)}><option>System default</option><option>Light</option><option>Dark</option></select></label>
                    <label><span>Language</span><select value={form.language} onChange={(event) => update("language", event.target.value)}>{["English", "Deutsch", "Čeština", "Italiano", "Polski", "Slovenčina", "Türkçe", "Українська", "中文"].map((language) => <option key={language}>{language}</option>)}</select></label>
                    <label className="onboarding-accent-field"><span>Accent colour</span><span className="onboarding-color-input"><input type="color" value={form.accent} aria-label="Accent colour" onChange={(event) => update("accent", event.target.value)} /><strong>{form.accent.toUpperCase()}</strong></span></label>
                  </div>
                </section>
                <section className="onboarding-form-section">
                  <div className="onboarding-section-title"><span><LayoutDashboard size={18} /></span><div><h2>Nutrition detail</h2><p>Keep the experience as simple or detailed as you like.</p></div></div>
                  <div className="onboarding-toggle-grid">
                    <ToggleCard label="Activity tracking" checked={form.showActivity} onChange={(checked) => update("showActivity", checked)} />
                    <ToggleCard label="Meal macros" checked={form.showMacros} onChange={(checked) => update("showMacros", checked)} />
                    <ToggleCard label="Micronutrients" checked={form.showMicros} onChange={(checked) => update("showMicros", checked)} />
                  </div>
                </section>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="onboarding-fields onboarding-final-step">
                <section className="onboarding-form-section onboarding-reminder-section">
                  <div className="onboarding-section-title"><span><Bell size={18} /></span><div><h2>Daily reminder</h2><p>Get one gentle nudge to log meals.</p></div></div>
                  <ToggleCard label="Remind me each day" description={form.notifications ? `Currently set for ${form.notificationTime}` : "Notifications are off"} checked={form.notifications} onChange={(checked) => update("notifications", checked)} />
                  {form.notifications ? <label className="onboarding-time-field"><span>Reminder time</span><input type="time" value={form.notificationTime} onChange={(event) => update("notificationTime", event.target.value)} /></label> : null}
                </section>
                <section className="onboarding-form-section">
                  <div className="onboarding-section-title"><span><LayoutDashboard size={18} /></span><div><h2>Your Home screen</h2><p>Turn off anything you don’t need. You can reorder sections later.</p></div></div>
                  <div className="onboarding-home-grid">
                    {homeSections.filter(([key]) => showWaterTracking || key !== "homeHabits").map(([key, label, description]) => <ToggleCard key={key} label={label} description={description} checked={form[key]} onChange={(checked) => update(key, checked)} />)}
                  </div>
                </section>
                <div className="onboarding-ready-card"><span><Check size={22} /></span><div><strong>You’re ready to start</strong><p>Your plan and preferences will be saved when you finish setup.</p></div></div>
              </div>
            ) : null}

            {error ? <p className="onboarding-error" role="alert">{error}</p> : null}
          </div>

          <footer className="onboarding-actions">
            <button className="onboarding-skip" type="button" disabled={saving} onClick={() => void save()}>Set up later</button>
            <div>
              <button className="onboarding-back" type="button" disabled={saving || step === 0} onClick={back}><ArrowLeft size={16} /> Back</button>
              <button className="primary-button" type="button" disabled={saving} onClick={() => step === steps.length - 1 ? void save() : next()}>
                {saving ? <LoaderCircle className="spin" size={17} /> : step === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}
                {saving ? "Saving…" : step === steps.length - 1 ? "Finish setup" : "Continue"}
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
