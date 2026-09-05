import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action && <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>{action}</span>}
    </div>
  );
}

export function ProgressBar({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return <span className="progress"><span style={{ width: `${Math.min(value, 100)}%`, background: color }} /></span>;
}

export function IconBadge({ children, tone = "green" }: { children: ReactNode; tone?: string }) {
  return <span className={`icon-badge ${tone}`}>{children}</span>;
}
