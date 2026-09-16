"use client";

const LOCAL_MODEL_BASE = "/ocr-assets/v1/models";
// Query-version the small cache-bridge bootstrap because the v1 asset directory is served
// immutable. This guarantees that browsers which cached the pre-cache-bridge
// bootstrap pick up the new Worker fetch hook after deployment.
export const NUTRITION_OCR_WORKER_URL = "/ocr-assets/v1/paddleocr-worker.js?cache-bridge=2";
const LOCAL_WORKER_ENTRY = "/ocr-assets/v1/worker-entry-C9UNuyOJ.js?small-only=1";
export const NUTRITION_OCR_WASM_PATH = "/ocr-assets/v1/ort/";
export const NUTRITION_OCR_MODEL_CACHE = "nutritracker-ocr-models-v1";

// Use the full PP-OCRv6 small pair for both detection and recognition. Keeping
// one model family avoids downloading and shipping a second detector while
// giving nutrition-table text the higher-accuracy detection pass.
export const NUTRITION_OCR_MODEL = {
  version: "PP-OCRv6-small-det-small-rec",
  detection: {
    name: "PP-OCRv6_small_det",
    url: `${LOCAL_MODEL_BASE}/PP-OCRv6_small_det_onnx_infer.tar`,
  },
  recognition: {
    name: "PP-OCRv6_small_rec",
    url: `${LOCAL_MODEL_BASE}/PP-OCRv6_small_rec_onnx_infer.tar`,
  },
} as const;

// The runtime remains pinned to the tested PaddleOCR.js distribution. Model
// archives are local static assets, so the slow upstream model host is never
// contacted by the app or by a user's first scan. Only these local files are
// part of the background warm-up. The CDN package is intentionally loaded on
// demand when the scanner opens; warming it on every page competes with the
// app shell and can make normal startup feel slower.
const LOCAL_RUNTIME_ASSET_URLS = [
  NUTRITION_OCR_WORKER_URL,
  LOCAL_WORKER_ENTRY,
  `${NUTRITION_OCR_WASM_PATH}ort-wasm-simd-threaded.jsep.mjs`,
  `${NUTRITION_OCR_WASM_PATH}ort-wasm-simd-threaded.jsep.wasm`,
] as const;

// Kept in the complete asset list for diagnostics and callers that want to
// inspect the full OCR dependency set. These are not fetched in the page
// background; PaddleOCR's normal module loader fetches them when needed.
const ON_DEMAND_RUNTIME_ASSET_URLS = [
  "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm",
  "https://cdn.jsdelivr.net/npm/js-yaml@4.2.0/+esm",
  "https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/+esm",
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/+esm",
] as const;

const RUNTIME_ASSET_URLS = [...LOCAL_RUNTIME_ASSET_URLS, ...ON_DEMAND_RUNTIME_ASSET_URLS] as const;

export const NUTRITION_OCR_ASSET_URLS = [
  NUTRITION_OCR_MODEL.detection.url,
  NUTRITION_OCR_MODEL.recognition.url,
  ...RUNTIME_ASSET_URLS,
] as const;

const RUNTIME_DOWNLOAD_CONCURRENCY = 3;
// Give the application shell, auth bootstrap, and first API requests a quiet
// window before starting the large background download. Opening the scanner
// still starts the download immediately through downloadNutritionOcrAssets().
const BACKGROUND_WARMUP_DELAY_MS = 5_000;
let assetDownload: Promise<void> | null = null;

// Chrome supports fetch priority and ignores unknown RequestInit fields in
// browsers that do not. Marking the prefetches low priority prevents a 30 MB
// OCR cache fill from taking bandwidth away from session/API requests.
type AssetRequestInit = RequestInit & { priority?: "high" | "low" | "auto" };
const BACKGROUND_FETCH_INIT: AssetRequestInit = {
  cache: "force-cache",
  mode: "cors",
  priority: "low",
};
const BACKGROUND_CACHE_FILL_INIT: AssetRequestInit = {
  cache: "no-store",
  mode: "cors",
  priority: "low",
};
const FOREGROUND_FETCH_INIT: AssetRequestInit = {
  cache: "force-cache",
  mode: "cors",
  priority: "high",
};
const FOREGROUND_CACHE_FILL_INIT: AssetRequestInit = {
  cache: "no-store",
  mode: "cors",
  priority: "high",
};

export type NutritionOcrAssetPriority = "background" | "foreground";

async function warmAsset(url: string, priority: NutritionOcrAssetPriority) {
  // Dedicated workers do not consistently reuse a page's in-flight/HTTP
  // cache entry for large model archives. Put just the model responses in a
  // versioned Cache Storage bucket so the worker can read the exact bytes
  // without another trip through the deployment. If Cache Storage is blocked
  // (private mode, quota, or an older browser), fall back to the normal HTTP
  // cache and let the worker fetch normally.
  const isModel = url.startsWith(`${LOCAL_MODEL_BASE}/`);
  if (isModel && typeof caches !== "undefined") {
    try {
      const modelCache = await caches.open(NUTRITION_OCR_MODEL_CACHE);
      if (await modelCache.match(url)) return;
      const response = await fetch(url, priority === "foreground" ? FOREGROUND_CACHE_FILL_INIT : BACKGROUND_CACHE_FILL_INIT);
      if (!response.ok) throw new Error(`OCR asset download failed with HTTP ${response.status}.`);
      await modelCache.put(url, response.clone());
      return;
    } catch (error) {
      // Quota/security failures are not fatal; use the regular path below.
      if (error instanceof Error && error.message.startsWith("OCR asset download failed")) throw error;
    }
  }

  const response = await fetch(url, priority === "foreground" ? FOREGROUND_FETCH_INIT : BACKGROUND_FETCH_INIT);
  if (!response.ok) throw new Error(`OCR asset download failed with HTTP ${response.status}.`);
  // Consume the body so the browser completes and stores the response in its
  // normal HTTP cache before the user opens the scanner.
  await response.arrayBuffer();
}

async function warmWithConcurrency(urls: readonly string[], concurrency: number, priority: NutritionOcrAssetPriority) {
  const failures: unknown[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (nextIndex < urls.length) {
      const url = urls[nextIndex];
      nextIndex += 1;
      try {
        await warmAsset(url, priority);
      } catch (error) {
        failures.push(error);
      }
    }
  });
  await Promise.all(workers);
  return failures;
}

async function downloadAssets(priority: NutritionOcrAssetPriority) {
  // Warm only the model pair and same-origin runtime files. The external
  // PaddleOCR helper modules remain on-demand so this work cannot delay the
  // app shell or turn an ordinary homepage visit into a CDN fan-out.
  const [modelResults, runtimeFailures] = await Promise.all([
    Promise.allSettled([
      warmAsset(NUTRITION_OCR_MODEL.detection.url, priority),
      warmAsset(NUTRITION_OCR_MODEL.recognition.url, priority),
    ]),
    warmWithConcurrency(LOCAL_RUNTIME_ASSET_URLS, RUNTIME_DOWNLOAD_CONCURRENCY, priority),
  ]);
  const failures = [
    ...modelResults.filter((result) => result.status === "rejected"),
    ...runtimeFailures,
  ];

  if (failures.length) throw new Error("One or more OCR assets could not be downloaded.");
}

/** Warm OCR files without starting a Worker or blocking the app shell. */
export function downloadNutritionOcrAssets(priority: NutritionOcrAssetPriority = "foreground"): Promise<void> {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_LABEL_SCANNER_ENABLED === "false") {
    return Promise.resolve();
  }
  if (assetDownload) return assetDownload;

  const currentDownload = downloadAssets(priority);
  assetDownload = currentDownload;
  void currentDownload.catch(() => {
    if (assetDownload === currentDownload) assetDownload = null;
  });
  return currentDownload;
}

function shouldWarmInBackground() {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_LABEL_SCANNER_ENABLED === "false") return false;
  if (!navigator.onLine || document.visibilityState !== "visible") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

/**
 * Start warming assets after the shell has painted, and retry after a
 * temporary offline/CDN failure. This is mounted at the app root, so it runs
 * on ordinary visits as well as onboarding—not only while the scanner is open.
 */
export function scheduleNutritionOcrAssetDownload(): () => void {
  if (typeof window === "undefined") return () => undefined;

  type IdleWindow = Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const idleWindow = window as IdleWindow;
  let idleId: number | undefined;
  let warmupId: number | undefined;
  let retryId: number | undefined;

  const clearPending = () => {
    if (idleId !== undefined) {
      if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      idleId = undefined;
    }
    if (warmupId !== undefined) {
      window.clearTimeout(warmupId);
      warmupId = undefined;
    }
    if (retryId !== undefined) {
      window.clearTimeout(retryId);
      retryId = undefined;
    }
  };

  function run() {
    idleId = undefined;
    if (!shouldWarmInBackground()) return;
    void downloadNutritionOcrAssets("background").catch(() => {
      // A temporary CDN/offline failure should not make the scanner unusable.
      // Retry after the connection has had time to settle.
      retryId = window.setTimeout(schedule, 30_000);
    });
  }

  function schedule() {
    clearPending();
    if (!shouldWarmInBackground() || assetDownload) return;
    // requestIdleCallback alone is not sufficient here: on a busy app it can
    // fire as soon as the first paint finishes, while the app is still
    // fetching auth/session data. Delay first, then wait for a real idle slot.
    warmupId = window.setTimeout(() => {
      warmupId = undefined;
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(run, { timeout: 8_000 });
      else idleId = window.setTimeout(run, 2_000);
    }, BACKGROUND_WARMUP_DELAY_MS);
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") schedule();
    else clearPending();
  };

  schedule();
  window.addEventListener("online", schedule);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    clearPending();
    window.removeEventListener("online", schedule);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
