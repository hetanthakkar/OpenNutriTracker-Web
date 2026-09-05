// App themes. Each theme is just a set of CSS-variable overrides in index.css
// (keyed by data-theme on <html>); this module owns the list + persistence.
export const THEMES = [
  { key: "forest", label: "Forest", swatch: "#22c55e", color: "#16a34a" },
  { key: "ocean", label: "Ocean", swatch: "#3b82f6", color: "#2563eb" },
  { key: "lavender", label: "Lavender", swatch: "#8b5cf6", color: "#7c3aed" },
  { key: "sunset", label: "Sunset", swatch: "#f97316", color: "#ea580c" },
  { key: "midnight", label: "Midnight", swatch: "#1e1b26", color: "#141118" },
  { key: "rose", label: "Rosé", swatch: "#f43f5e", color: "#e11d6b" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

const STORAGE_KEY = "paired_theme";
const DEFAULT: ThemeKey = "forest";

export function getTheme(): ThemeKey {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t && THEMES.some((x) => x.key === t)) return t as ThemeKey;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT;
}

export function applyTheme(theme: ThemeKey): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  // Keep the browser/PWA status-bar tint in sync.
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = THEMES.find((t) => t.key === theme)?.color;
  if (meta && color) meta.setAttribute("content", color);
}
