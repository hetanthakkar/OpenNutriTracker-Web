const appearanceStorageKey = "ont:appearance-preferences:v1";

export type AppearancePreferences = { accent?: unknown; theme?: unknown };

function validTheme(value: unknown): value is "Light" | "Dark" | "System default" {
  return value === "Light" || value === "Dark" || value === "System default";
}

// Runs synchronously in <head>, before the body or React can paint. Keep this
// small bootstrap aligned with applyAppearance; it cannot wait for a bundle.
export const appearanceBootstrap = `
(function () {
  var appearance = {};
  try {
    var saved = JSON.parse(window.localStorage.getItem("${appearanceStorageKey}") || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) appearance = saved;
  } catch (_) {}
  var root = document.documentElement;
  var theme = appearance.theme === "Light" || appearance.theme === "Dark" ? appearance.theme : "System default";
  var dark = theme === "Dark" || (theme === "System default" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.themePreference = theme;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = root.dataset.theme;
  if (typeof appearance.accent === "string" && /^#[0-9a-f]{6}$/i.test(appearance.accent)) {
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--accent-soft", appearance.accent + "20");
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#1b1a18" : "#f7f4ef");
})();
`;

export function validAccent(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function readCachedAppearance(): { accent?: string; theme?: string } {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(appearanceStorageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const appearance = value as AppearancePreferences;
    return {
      ...(validAccent(appearance.accent) ? { accent: appearance.accent } : {}),
      ...(validTheme(appearance.theme) ? { theme: appearance.theme } : {}),
    };
  } catch {
    return {};
  }
}

export function cacheAppearance(value: AppearancePreferences) {
  if (typeof window === "undefined") return;
  const current = readCachedAppearance();
  const next = {
    ...current,
    ...(validAccent(value.accent) ? { accent: value.accent } : {}),
    ...(validTheme(value.theme) ? { theme: value.theme } : {}),
  };
  try { window.localStorage.setItem(appearanceStorageKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
}

export function applyAppearance(value: AppearancePreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (validAccent(value.accent)) {
    root.style.setProperty("--accent", value.accent);
    root.style.setProperty("--accent-soft", `${value.accent}20`);
  }
  const theme = validTheme(value.theme) ? value.theme : root.dataset.themePreference ?? "System default";
  const dark = theme === "Dark" || (theme === "System default" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.themePreference = theme;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1b1a18" : "#f7f4ef");
}
