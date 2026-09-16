"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, ChevronRight, Droplets, Flag, Footprints, HeartPulse, Languages, Moon, Palette, Ruler, Scale, Target, TrendingDown, Users, X } from "lucide-react";
import { Card } from "./ui";
import { AppleHealthSection } from "./apple-health-section";
import type { SettingsPanelId } from "./settings-view";
import { type WaterUnit, formatWaterAmount, waterAmountToMl, waterDisplayValue, waterUnitLabel } from "@/lib/water-units";
import { formatHeight, formatWeight, heightAmountToCm, heightDisplayValue, heightUnitLabel, type HeightUnit, type WeightUnit, weightAmountToKg, weightDisplayValue, weightUnitLabel } from "@/lib/user-preferences";
import { disableNotifications, enableNotifications } from "@/lib/notifications";
import { DateOfBirthFields } from "./date-of-birth-fields";
import { showWaterTracking } from "@/lib/ui-features";

type ProfileViewProps = {
  onToast: (message: string) => void;
  onOpenSettings: (panel?: SettingsPanelId) => void;
  onAddWeight: () => void;
  onProfileChange?: (profile: UserProfile) => void;
  cacheScope: string;
  weightKg: number | null;
  waterUnit: WaterUnit;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  locale: string;
};
type UserProfile = {
  displayName: string;
  heightCm: number | null;
  dateOfBirth: string | null;
  energyEquationSex: "female" | "male" | null;
  targetWeightKg: number | null;
  activityLevel: string;
  goal: string;
  weeklyRateKg: number | null;
  waterGoalMl: number;
};
const emptyProfile: UserProfile = { displayName: "Profile", heightCm: null, dateOfBirth: null, energyEquationSex: null, targetWeightKg: null, activityLevel: "active", goal: "maintain_weight", weeklyRateKg: null, waterGoalMl: 1900 };
type AccountDetails = { profile: UserProfile; notifications: boolean; sharingCount: number; appleHealthEnabled: boolean };

const accountDetailsCache = new Map<string, AccountDetails>();
const accountDetailsRequests = new Map<string, Promise<AccountDetails>>();

function updateAccountDetailsCache(cacheScope: string, changes: Partial<AccountDetails>) {
  const current = accountDetailsCache.get(cacheScope);
  if (current) accountDetailsCache.set(cacheScope, { ...current, ...changes });
}

function requestAccountDetails(cacheScope: string) {
  const cached = accountDetailsCache.get(cacheScope);
  if (cached) return Promise.resolve(cached);
  const pending = accountDetailsRequests.get(cacheScope);
  if (pending) return pending;

  const request = Promise.all([fetch("/api/me"), fetch("/api/me/preferences"), fetch("/api/sharing"), fetch("/api/health/conduit")])
    .then(async ([profileResponse, preferencesResponse, sharingResponse, healthResponse]) => {
      const profileData = await profileResponse.json() as UserProfile & { message?: string };
      const preferencesData = await preferencesResponse.json() as { preferences?: { notifications?: boolean; appleHealthEnabled?: boolean }; message?: string };
      const sharingData = await sharingResponse.json() as { outgoing?: unknown[]; incoming?: unknown[]; message?: string };
      const healthData = await healthResponse.json() as { configured?: boolean };
      if (!profileResponse.ok) throw new Error(profileData.message ?? "Could not load your profile.");
      if (!preferencesResponse.ok) throw new Error(preferencesData.message ?? "Could not load reminders.");
      if (!sharingResponse.ok) throw new Error(sharingData.message ?? "Could not load sharing connections.");
      const details = {
        profile: profileData,
        notifications: preferencesData.preferences?.notifications ?? true,
        sharingCount: (sharingData.outgoing?.length ?? 0) + (sharingData.incoming?.length ?? 0),
        appleHealthEnabled: typeof preferencesData.preferences?.appleHealthEnabled === "boolean"
          ? preferencesData.preferences.appleHealthEnabled
          : Boolean(healthResponse.ok && healthData.configured),
      } satisfies AccountDetails;
      accountDetailsCache.set(cacheScope, details);
      return details;
    })
    .finally(() => accountDetailsRequests.delete(cacheScope));
  accountDetailsRequests.set(cacheScope, request);
  return request;
}

function goalLabel(goal: string) {
  return goal === "lose_weight" ? "Lose weight" : goal === "gain_weight" ? "Gain weight" : "Maintain weight";
}

function activityLabel(level: string) {
  return level === "very_active" ? "Very active" : level === "light" ? "Lightly active" : level === "sedentary" ? "Sedentary" : "Active";
}

function avatarInitials(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "P";
}

export function ProfileView({ onToast, onOpenSettings, onAddWeight, onProfileChange, cacheScope, weightKg, waterUnit, weightUnit, heightUnit, locale }: ProfileViewProps) {
  const cachedDetails = accountDetailsCache.get(cacheScope);
  const [notifications, setNotifications] = useState(() => cachedDetails?.notifications ?? true);
  const [profile, setProfile] = useState<UserProfile>(() => cachedDetails?.profile ?? emptyProfile);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [sharingCount, setSharingCount] = useState(() => cachedDetails?.sharingCount ?? 0);
  const [appleHealthEnabled, setAppleHealthEnabled] = useState(() => cachedDetails?.appleHealthEnabled ?? false);

  useEffect(() => {
    let cancelled = false;
    const apply = (details: AccountDetails) => {
      if (cancelled) return;
      setProfile(details.profile);
      setNotifications(details.notifications);
      setSharingCount(details.sharingCount);
      setAppleHealthEnabled(details.appleHealthEnabled);
      setError("");
    };
    const cached = accountDetailsCache.get(cacheScope);
    if (cached) apply(cached);
    else void requestAccountDetails(cacheScope).then(apply).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load your profile.");
    });
    return () => { cancelled = true; };
  }, [cacheScope]);

  const bmi = useMemo(() => weightKg !== null && profile.heightCm ? weightKg / ((profile.heightCm / 100) ** 2) : null, [profile.heightCm, weightKg]);
  const goalItems: ProfileItem[] = [
    { icon: Footprints, title: "Activity", value: activityLabel(profile.activityLevel) },
    { icon: Flag, title: "Goal", value: goalLabel(profile.goal) },
    { icon: TrendingDown, title: "Weekly rate", value: profile.weeklyRateKg === null ? "Not set" : `${profile.weeklyRateKg < 0 ? "−" : "+"}${formatWeight(Math.abs(profile.weeklyRateKg), weightUnit, locale)} / week` },
  ];
  const bodyItems: ProfileItem[] = [
    { icon: Scale, title: "Weight", value: weightKg === null ? "No weight recorded" : formatWeight(weightKg, weightUnit, locale) },
    { icon: Target, title: "Target weight", value: profile.targetWeightKg === null ? "Not set" : formatWeight(profile.targetWeightKg, weightUnit, locale) },
    { icon: Ruler, title: "Height", value: profile.heightCm === null ? "Not set" : formatHeight(profile.heightCm, heightUnit, locale) },
    ...(showWaterTracking ? [{ icon: Droplets, title: "Daily water goal", value: formatWaterAmount(profile.waterGoalMl, waterUnit) }] : []),
  ];

  const saveProfile = async (next: UserProfile) => {
    const response = await fetch("/api/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const data = await response.json() as UserProfile & { message?: string };
    if (!response.ok) throw new Error(data.message ?? "Could not save your profile.");
    setProfile(data);
    updateAccountDetailsCache(cacheScope, { profile: data });
    onProfileChange?.(data);
    setEditing(false);
    onToast("Profile updated");
  };

  /* Profile switching is intentionally disabled in the single-user UI. The profile APIs remain available for a future household mode. */

  const updateNotifications = async (enabled: boolean) => {
    setNotifications(enabled);
    try {
      const notificationMessage = await (enabled ? enableNotifications() : disableNotifications());
      const response = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { notifications: enabled } }) });
      if (!response.ok) throw new Error("Could not save reminders.");
      updateAccountDetailsCache(cacheScope, { notifications: enabled });
      onToast(notificationMessage);
    } catch (requestError) {
      setNotifications(!enabled);
      setError(requestError instanceof Error ? requestError.message : "Could not save reminders.");
    }
  };

  const updateAppleHealthEnabled = async (enabled: boolean) => {
    const previous = appleHealthEnabled;
    setAppleHealthEnabled(enabled);
    try {
      const response = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { appleHealthEnabled: enabled } }) });
      if (!response.ok) throw new Error("Could not save the Apple Health preference.");
      updateAccountDetailsCache(cacheScope, { appleHealthEnabled: enabled });
    } catch (requestError) {
      setAppleHealthEnabled(previous);
      setError(requestError instanceof Error ? requestError.message : "Could not save the Apple Health preference.");
    }
  };

  return (
    <div className="profile-layout menu-profile-layout">
      <Card className="profile-hero">
        <span className="profile-initials" aria-label={`${profile.displayName} profile`}>{avatarInitials(profile.displayName)}</span>
        <div><span className="eyebrow">Current profile</span><h2>{profile.displayName}</h2><p>Your personal nutrition plan</p><div><button onClick={() => setEditing(true)}>Edit profile</button>{/* Profile switching is hidden for the single-user experience. */}</div></div>
        <div className="bmi-badge"><strong>{bmi === null ? "—" : bmi.toFixed(1)}</strong><span>BMI</span></div>
      </Card>
      {error && <p className="food-picker-error" role="alert">{error}</p>}
      <ProfileGroup title="Your goal" items={goalItems} />
      <ProfileGroup title="Measurements" items={bodyItems} />
      <section className="settings-section"><h2>Quick options</h2><Card>
          <SettingRow icon={Palette} title="Accent colour" value="Leaf green" onClick={() => onOpenSettings("accent")} />
          <SettingRow icon={Languages} title="Language" value="English" onClick={() => onOpenSettings("language")} />
          <SettingRow icon={Moon} title="Appearance" value="System" onClick={() => onOpenSettings("theme")} />
          <div className="setting-row"><span className="round-icon green"><Bell size={18} /></span><div><strong>Reminders</strong><small>Meal nudges</small></div><label className="switch"><input type="checkbox" checked={notifications} onChange={(event) => void updateNotifications(event.target.checked)} /><span /></label></div>
      </Card></section>
      <section className="settings-section"><h2>Account</h2><Card>
        <SettingRow icon={Scale} title="Add weight" value={weightKg === null ? "Record your first weigh-in" : `Current: ${formatWeight(weightKg, weightUnit, locale)}`} onClick={onAddWeight} />
        <SettingRow icon={Users} title="Partner sharing" value={sharingCount === 0 ? "Not connected" : `${sharingCount} active connection${sharingCount === 1 ? "" : "s"}`} onClick={() => onOpenSettings("connected-partners")} />
        <div className="setting-row"><span className="round-icon green"><HeartPulse size={18} /></span><div><strong>Enable Apple Health</strong><small>Connect and manage your Health data sync</small></div><label className="switch"><input type="checkbox" checked={appleHealthEnabled} aria-label="Enable Apple Health" onChange={(event) => void updateAppleHealthEnabled(event.target.checked)} /><span /></label></div>
      </Card></section>
      {appleHealthEnabled ? <AppleHealthSection /> : null}
      {editing && <ProfileEditor profile={profile} waterUnit={waterUnit} weightUnit={weightUnit} heightUnit={heightUnit} onClose={() => setEditing(false)} onSave={saveProfile} />}
      {/* The household profile switcher is intentionally commented out for the single-user experience. */}
    </div>
  );
}

type ProfileItem = { icon: LucideIcon; title: string; value: string };

function ProfileGroup({ title, items }: { title: string; items: ProfileItem[] }) {
  return <section className="profile-group"><h2>{title}</h2><Card>{items.map(({ icon: Icon, title: itemTitle, value }) => <div className="profile-detail-row" key={itemTitle}><span className="round-icon green"><Icon size={19} /></span><span><strong>{itemTitle}</strong><small>{value}</small></span></div>)}</Card></section>;
}

function SettingRow({ icon: Icon, title, value, onClick }: { icon: LucideIcon; title: string; value: string; onClick: () => void }) {
  return <button className="setting-row" onClick={onClick}><span className="round-icon green"><Icon size={18} /></span><div><strong>{title}</strong>{value && <small>{value}</small>}</div><ChevronRight size={18} /></button>;
}

function ProfileEditor({ profile, waterUnit, weightUnit, heightUnit, onClose, onSave }: { profile: UserProfile; waterUnit: WaterUnit; weightUnit: WeightUnit; heightUnit: HeightUnit; onClose: () => void; onSave: (profile: UserProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [heightInput, setHeightInput] = useState(() => profile.heightCm === null ? "" : String(Number(heightDisplayValue(profile.heightCm, heightUnit).toFixed(heightUnit === "ft_in" ? 2 : 0))));
  const [targetWeightInput, setTargetWeightInput] = useState(() => profile.targetWeightKg === null ? "" : String(Number(weightDisplayValue(profile.targetWeightKg, weightUnit).toFixed(1))));
  const [weeklyRateInput, setWeeklyRateInput] = useState(() => profile.weeklyRateKg === null ? "" : String(Number(weightDisplayValue(profile.weeklyRateKg, weightUnit).toFixed(2))));
  const [waterGoalInput, setWaterGoalInput] = useState(() => waterDisplayValue(profile.waterGoalMl, waterUnit).toFixed(waterUnit === "fl_oz" ? 1 : 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setError("");
    const heightCm = heightInput.trim() ? heightAmountToCm(Number(heightInput), heightUnit) : null;
    const targetWeightKg = targetWeightInput.trim() ? weightAmountToKg(Number(targetWeightInput), weightUnit) : null;
    const weeklyRateKg = weeklyRateInput.trim() ? weightAmountToKg(Number(weeklyRateInput), weightUnit) : null;
    const displayWaterGoal = Number(waterGoalInput);
    const waterGoalMl = showWaterTracking ? Math.round(waterAmountToMl(displayWaterGoal, waterUnit)) : profile.waterGoalMl;
    if ((heightInput.trim() && (heightCm === null || !Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250))
      || (targetWeightInput.trim() && (targetWeightKg === null || !Number.isFinite(targetWeightKg) || targetWeightKg < 20 || targetWeightKg > 500))
      || (weeklyRateInput.trim() && (weeklyRateKg === null || !Number.isFinite(weeklyRateKg) || weeklyRateKg < -2 || weeklyRateKg > 2))
      || (showWaterTracking && (!waterGoalInput.trim() || !Number.isFinite(displayWaterGoal) || waterGoalMl < 250 || waterGoalMl > 10000))) {
      setError("Check the measurement values.");
      setSaving(false);
      return;
    }
    try { await onSave({ ...draft, heightCm, targetWeightKg, weeklyRateKg, waterGoalMl }); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save your profile."); setSaving(false); }
  };
  return <div className="modal-backdrop profile-editor-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="profile-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" /><header><div><span className="eyebrow">Your plan</span><h2 id="profile-editor-title">Edit profile</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></header>
      <div className="profile-editor-fields">
        <label>Name<input value={draft.displayName} maxLength={80} onChange={(event) => update("displayName", event.target.value)} /></label>
        <label>Height ({heightUnitLabel(heightUnit)})<input type="number" min={heightUnit === "ft_in" ? 2.6 : 80} max={heightUnit === "ft_in" ? 8.2 : 250} step={heightUnit === "ft_in" ? 0.1 : 1} value={heightInput} onChange={(event) => setHeightInput(event.target.value)} /></label>
        <fieldset className="profile-date-of-birth"><legend>Date of birth</legend><DateOfBirthFields value={draft.dateOfBirth} onChange={(value) => update("dateOfBirth", value)} /></fieldset>
        <label>Energy equation sex<select value={draft.energyEquationSex ?? ""} onChange={(event) => update("energyEquationSex", event.target.value === "female" || event.target.value === "male" ? event.target.value : null)}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option></select></label>
        <label>Target weight ({weightUnitLabel(weightUnit)})<input type="number" min={weightUnit === "kg" ? 20 : weightUnit === "lb" ? 44 : 3} max={weightUnit === "kg" ? 500 : weightUnit === "lb" ? 1100 : 79} step="0.1" value={targetWeightInput} onChange={(event) => setTargetWeightInput(event.target.value)} /></label>
        <div className="profile-activity-field">
          <label>Activity level<select value={draft.activityLevel} aria-describedby="activity-level-help" onChange={(event) => update("activityLevel", event.target.value)}><option value="sedentary">Sedentary</option><option value="light">Lightly active</option><option value="active">Active</option><option value="very_active">Very active</option></select></label>
          <p id="activity-level-help">We start with your resting-energy estimate and multiply it by this level. Your food and weight history refine that estimate over time.</p>
          <details>
            <summary>How should I choose?</summary>
            <p>Think about your usual week—including work, errands, walking, and exercise—not your best workout day. The multiplier is applied to your Mifflin–St Jeor resting-energy estimate.</p>
            <ul>
              <li><strong>Sedentary · ×1.20:</strong> Mostly sitting, with only everyday movement and little planned exercise.</li>
              <li><strong>Lightly active · ×1.375:</strong> A mostly seated day with regular walking, errands, or light exercise about 1–3 days a week.</li>
              <li><strong>Active · ×1.55:</strong> Lots of daily movement, an on-your-feet job, or moderate exercise about 3–5 days a week.</li>
              <li><strong>Very active · ×1.725:</strong> Physically demanding work or hard training on most days.</li>
            </ul>
            <p className="activity-level-note">There is no separate “moderate” setting: choose Active for that pattern. This multiplier sets only the initial TDEE; logging a workout does not add its calories straight to today’s budget.</p>
          </details>
        </div>
        <label>Goal<select value={draft.goal} onChange={(event) => update("goal", event.target.value)}><option value="lose_weight">Lose weight</option><option value="maintain_weight">Maintain weight</option><option value="gain_weight">Gain weight</option></select></label>
        <label>Weekly rate ({weightUnitLabel(weightUnit)})<input type="number" min={weightUnit === "kg" ? -2 : weightUnit === "lb" ? -4.4 : -0.3} max={weightUnit === "kg" ? 2 : weightUnit === "lb" ? 4.4 : 0.3} step="0.05" value={weeklyRateInput} onChange={(event) => setWeeklyRateInput(event.target.value)} /></label>
        {showWaterTracking ? <label>Water goal ({waterUnitLabel(waterUnit)})<input type="number" min={waterUnit === "fl_oz" ? 8 : 250} max={waterUnit === "fl_oz" ? 338 : 10000} step={waterUnit === "fl_oz" ? 1 : 50} value={waterGoalInput} onChange={(event) => setWaterGoalInput(event.target.value)} /></label> : null}
      </div>
      {error && <p className="food-picker-error" role="alert">{error}</p>}<button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save profile"}</button>
    </section>
  </div>;
}
