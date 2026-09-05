"use client";

import Image from "next/image";
import { useState } from "react";
import { Bell, ChevronRight, Droplets, Flag, Footprints, HeartPulse, Languages, Moon, Palette, Ruler, Scale, Settings, Target, TrendingDown, Users } from "lucide-react";
import { Card } from "./ui";
import type { SettingsPanelId } from "./settings-view";

type ProfileViewProps = {
  onToast: (message: string) => void;
  onOpenSettings: (panel?: SettingsPanelId) => void;
};

const goalItems = [
  { icon: Footprints, title: "Activity", value: "Active" },
  { icon: Flag, title: "Goal", value: "Lose weight" },
  { icon: TrendingDown, title: "Weekly rate", value: "−0.40 kg / week" },
];

const bodyItems = [
  { icon: Scale, title: "Weight", value: "87.0 kg" },
  { icon: Target, title: "Target weight", value: "78.0 kg" },
  { icon: Ruler, title: "Height", value: "178 cm" },
  { icon: Droplets, title: "Daily water goal", value: "1,900 ml" },
];

const demoProfiles = [
  { name: "Alex Demo", member: "July 2026", bmi: "27.5" },
  { name: "Jamie Demo", member: "August 2026", bmi: "23.1" },
];

export function ProfileView({ onToast, onOpenSettings }: ProfileViewProps) {
  const [notifications, setNotifications] = useState(true);
  const [profileIndex, setProfileIndex] = useState(0);
  const profile = demoProfiles[profileIndex];

  const switchProfile = () => {
    const next = (profileIndex + 1) % demoProfiles.length;
    setProfileIndex(next);
    onToast(`Switched to ${demoProfiles[next].name}.`);
  };

  return (
    <div className="profile-layout">
      <div className="profile-main">
        <Card className="profile-hero">
          <Image src="/images/avatar.jpg" alt={profile.name} width={92} height={92} />
          <div><span className="eyebrow">Current profile</span><h2>{profile.name}</h2><p>Member since {profile.member}</p><button onClick={switchProfile}>Switch profile</button></div>
          <div className="bmi-badge"><strong>{profile.bmi}</strong><span>BMI</span></div>
        </Card>

        <div className="profile-columns">
          <ProfileGroup title="Your goal" items={goalItems} />
          <ProfileGroup title="Measurements" items={bodyItems} />
        </div>
      </div>

      <aside className="profile-aside">
        <Card className="health-card"><span className="round-icon coral"><HeartPulse size={21} /></span><div><span>Health overview</span><strong>Pre-obesity</strong><small>Risk of comorbidities: increased</small></div></Card>
        <section className="settings-section"><h2>Preferences</h2><Card>
          <SettingRow icon={Palette} title="Accent colour" value="Leaf green" onClick={() => onOpenSettings("accent")} />
          <SettingRow icon={Languages} title="Language" value="English" onClick={() => onOpenSettings("language")} />
          <SettingRow icon={Moon} title="Appearance" value="System" onClick={() => onOpenSettings("theme")} />
          <div className="setting-row"><span className="round-icon green"><Bell size={18} /></span><div><strong>Reminders</strong><small>Meal and water nudges</small></div><label className="switch"><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /><span /></label></div>
        </Card></section>
        <section className="settings-section"><h2>Account</h2><Card>
          <SettingRow icon={Users} title="Partner sharing" value="1 connected" onClick={() => onOpenSettings("connected-partners")} />
          <SettingRow icon={Settings} title="All settings" value="" onClick={() => onOpenSettings()} />
        </Card></section>
      </aside>
    </div>
  );
}

function ProfileGroup({ title, items }: { title: string; items: typeof goalItems }) {
  return <section className="profile-group"><h2>{title}</h2><Card>{items.map(({ icon: Icon, title: itemTitle, value }) => <div className="profile-detail-row" key={itemTitle}><span className="round-icon green"><Icon size={19} /></span><span><strong>{itemTitle}</strong><small>{value}</small></span></div>)}</Card></section>;
}

function SettingRow({ icon: Icon, title, value, onClick }: { icon: typeof Palette; title: string; value: string; onClick: () => void }) {
  return <button className="setting-row" onClick={onClick}><span className="round-icon green"><Icon size={18} /></span><div><strong>{title}</strong>{value && <small>{value}</small>}</div><ChevronRight size={18} /></button>;
}
