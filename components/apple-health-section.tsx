"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BedDouble, Check, Copy, ExternalLink, Footprints, HeartPulse,
  Link2, MoonStar, Route, Scale, Timer, TrendingUp, Watch, X,
} from "lucide-react";
import { LineChart } from "./charts";
import { Card } from "./ui";
import {
  conduitCategories,
  conduitHealthSummary,
  conduitHealthTrends,
  type HealthTrendPeriod,
} from "@/lib/apple-health";

const STORAGE_KEY = "ont:conduit-health-preview";

export function AppleHealthSection({ period }: { period: HealthTrendPeriod }) {
  const [connected, setConnected] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setConnected(window.localStorage.getItem(STORAGE_KEY) === "connected");
  }, []);

  const webhookPreview = useMemo(() => {
    if (typeof window === "undefined") return "/api/health/conduit";
    return `${window.location.origin}/api/health/conduit`;
  }, []);

  const connectPreview = () => {
    window.localStorage.setItem(STORAGE_KEY, "connected");
    setConnected(true);
    setSetupOpen(false);
  };

  const disconnect = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setConnected(false);
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookPreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!connected) {
    return (
      <section className="apple-health-section">
        <Card className="health-connect-card">
          <div className="health-connect-copy">
            <span className="health-logo"><HeartPulse size={22} /></span>
            <div>
              <div className="health-title-row">
                <strong>Apple Health</strong>
                <span>Optional</span>
              </div>
              <p>Bring activity, sleep, heart, workout and body data into your trends with Conduit Health Sync.</p>
              <small>Skip this and the rest of OpenNutriTracker works exactly the same.</small>
            </div>
          </div>
          <button className="secondary-button health-connect-button" onClick={() => setSetupOpen(true)}>
            <Link2 size={17} /> Connect
          </button>
        </Card>

        {setupOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setSetupOpen(false)}>
            <section className="health-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="health-setup-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="health-setup-head">
                <div>
                  <span className="eyebrow">Optional integration</span>
                  <h2 id="health-setup-title">Connect Apple Health with Conduit</h2>
                  <p>Conduit reads only the Apple Health categories you allow and forwards them to your webhook.</p>
                </div>
                <button className="icon-button" aria-label="Close" onClick={() => setSetupOpen(false)}><X size={20} /></button>
              </div>

              <div className="health-setup-steps">
                <div className="health-step">
                  <span>1</span>
                  <div>
                    <strong>Install Conduit Health Sync</strong>
                    <p>The App Store listing is free and requires iOS 17 or later.</p>
                    <a href="https://apps.apple.com/us/app/conduit-health-sync/id6786544769" target="_blank" rel="noreferrer">
                      Open App Store <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
                <div className="health-step">
                  <span>2</span>
                  <div>
                    <strong>Choose what you want to share</strong>
                    <p>Enable only the Health categories you want OpenNutriTracker to receive.</p>
                    <div className="health-category-chips">{conduitCategories.map((category) => <span key={category}>{category}</span>)}</div>
                  </div>
                </div>
                <div className="health-step">
                  <span>3</span>
                  <div>
                    <strong>Add your webhook</strong>
                    <p>This is the endpoint the production backend should expose for Conduit.</p>
                    <div className="health-webhook">
                      <code>{webhookPreview}</code>
                      <button onClick={copyWebhook} aria-label="Copy webhook URL">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="health-preview-note">
                <Watch size={18} />
                <p><strong>Frontend preview:</strong> the repository does not have the webhook backend yet, so this button loads representative Conduit-shaped demo data.</p>
              </div>

              <div className="health-setup-actions">
                <button className="dialog-cancel" onClick={() => setSetupOpen(false)}>Not now</button>
                <button className="primary-button" onClick={connectPreview}>Preview connected view</button>
              </div>
            </section>
          </div>
        )}
      </section>
    );
  }

  const trend = conduitHealthTrends[period];

  return (
    <section className="apple-health-section">
      <div className="health-section-head">
        <div>
          <span className="eyebrow">Apple Health</span>
          <h2>Health & activity</h2>
          <p>Synced through Conduit · {conduitHealthSummary.syncedAt}</p>
        </div>
        <div className="health-source-actions">
          <span className="health-live"><i /> Connected</span>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      <div className="health-kpis">
        <HealthKpi icon={Footprints} label="Steps" value={conduitHealthSummary.steps.toLocaleString()} detail="today" />
        <HealthKpi icon={Activity} label="Active energy" value={`${conduitHealthSummary.activeEnergyKcal}`} unit="kcal" detail={`${conduitHealthSummary.exerciseMinutes} exercise min`} />
        <HealthKpi icon={BedDouble} label="Sleep" value={conduitHealthSummary.sleepLabel} detail="last night" />
        <HealthKpi icon={HeartPulse} label="Resting heart rate" value={`${conduitHealthSummary.restingHeartRateBpm}`} unit="bpm" detail={`HRV ${conduitHealthSummary.hrvMs} ms`} />
      </div>

      <div className="health-chart-grid">
        <Card className="chart-card health-chart-card">
          <div className="chart-title">
            <div><span>Steps</span><strong>{trend.steps.at(-1)?.toLocaleString()} <small>latest</small></strong></div>
            <span className="chart-pill"><Footprints size={15} /> {period}</span>
          </div>
          <LineChart values={[...trend.steps]} labels={[...trend.labels]} />
        </Card>
        <Card className="chart-card health-chart-card">
          <div className="chart-title">
            <div><span>Sleep</span><strong>{trend.sleep.at(-1)} <small>hours</small></strong></div>
            <span className="chart-pill"><MoonStar size={15} /> {period}</span>
          </div>
          <LineChart values={[...trend.sleep]} color="var(--blue)" labels={[...trend.labels]} />
        </Card>
        <Card className="chart-card health-chart-card">
          <div className="chart-title">
            <div><span>Resting heart rate</span><strong>{trend.restingHeartRate.at(-1)} <small>bpm</small></strong></div>
            <span className="chart-pill"><HeartPulse size={15} /> {period}</span>
          </div>
          <LineChart values={[...trend.restingHeartRate]} color="var(--protein)" labels={[...trend.labels]} />
        </Card>
      </div>

      <Card className="health-details-card">
        <div className="health-details-head">
          <div><span>Latest synced measurements</span><strong>From Apple Health</strong></div>
          <span className="health-live"><i /> {conduitHealthSummary.syncedAt}</span>
        </div>
        <div className="health-detail-grid">
          <HealthDetail icon={Route} label="Distance" value={`${conduitHealthSummary.distanceKm} km`} />
          <HealthDetail icon={Timer} label="Workouts" value={`${conduitHealthSummary.workouts} · ${conduitHealthSummary.workoutMinutes} min`} />
          <HealthDetail icon={HeartPulse} label="Heart rate" value={`${conduitHealthSummary.heartRateBpm} bpm`} />
          <HealthDetail icon={TrendingUp} label="VO₂ max" value={`${conduitHealthSummary.vo2Max} ml/kg/min`} />
          <HealthDetail icon={Scale} label="Weight" value={`${conduitHealthSummary.weightKg} kg`} />
          <HealthDetail icon={Scale} label="Body fat" value={`${conduitHealthSummary.bodyFatPercent}%`} />
          <HealthDetail icon={Activity} label="Blood oxygen" value={`${conduitHealthSummary.oxygenSaturationPercent}%`} />
          <HealthDetail icon={Activity} label="Respiratory rate" value={`${conduitHealthSummary.respiratoryRate}/min`} />
          <HealthDetail icon={Activity} label="Dietary energy" value={`${conduitHealthSummary.nutrition.calories.toLocaleString()} kcal`} />
          <HealthDetail icon={Activity} label="Protein" value={`${conduitHealthSummary.nutrition.proteinG} g`} />
          <HealthDetail icon={Activity} label="Carbohydrates" value={`${conduitHealthSummary.nutrition.carbsG} g`} />
          <HealthDetail icon={Activity} label="Fat" value={`${conduitHealthSummary.nutrition.fatG} g`} />
          <HealthDetail icon={Footprints} label="Running speed" value={`${conduitHealthSummary.running.speedKph} km/h`} />
          <HealthDetail icon={TrendingUp} label="Running power" value={`${conduitHealthSummary.running.powerW} W`} />
          <HealthDetail icon={Footprints} label="Stride length" value={`${conduitHealthSummary.running.strideLengthM} m`} />
          <HealthDetail icon={Footprints} label="Ground contact" value={`${conduitHealthSummary.running.groundContactMs} ms`} />
        </div>
        <div className="health-data-foot">
          <span>Only categories enabled in Apple Health should be stored and shown.</span>
          <span>Production UI can hide measurements that were not shared or are unavailable.</span>
        </div>
      </Card>
    </section>
  );
}

function HealthKpi({
  icon: Icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  detail: string;
}) {
  return (
    <Card className="health-kpi">
      <span className="round-icon green"><Icon size={19} /></span>
      <div><span>{label}</span><strong>{value}{unit && <small> {unit}</small>}</strong><em>{detail}</em></div>
    </Card>
  );
}

function HealthDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="health-detail">
      <span className="round-icon green"><Icon size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}
