"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Barcode, Camera, ChevronRight, LoaderCircle, RotateCw, ScanLine, Square, Upload, X } from "lucide-react";
import { parseNutritionLabel, reconcileNutritionScans, type NutritionScanResult, type ScannedNutrient } from "@/lib/nutrition-label";
import { downloadNutritionOcrAssets, NUTRITION_OCR_MODEL, NUTRITION_OCR_WASM_PATH, NUTRITION_OCR_WORKER_URL } from "@/lib/nutrition-ocr-assets";
import { nutritionOcrSettings } from "@/lib/nutrition-ocr-settings";
import { applyLiveNutritionEdits, type LiveNutrientEdits, type LiveServingEdits } from "@/lib/nutrition-live-draft";
import { barcodeNutritionResult, type BarcodeFood } from "@/lib/barcode-scan-result";
import { NutritionFactsPanel } from "./nutrition-facts-panel";

export type LabelScanDraft = {
  barcode?: string; sourceUrl?: string;
  name: string; brand: string; servingGrams: number | null; servingMl: number | null; servingAmount: number; servingUnit: string; nutritionBasis: NutritionScanResult["basis"]; nutrients: Record<string, number>;
};

type OcrOutput = {
  items?: Array<{ text?: unknown; score?: unknown; poly?: unknown }>;
};

type OcrEngine = {
  predict(input: HTMLCanvasElement): Promise<OcrOutput[]>;
  dispose(): Promise<void>;
};

const OCR_IDLE_TIMEOUT_MS = 5 * 60 * 1_000;
// A first visit can still be a cold deployment/cache miss. The scanner waits
// for the same shared background asset promise, but keeps a finite fallback
// instead of hanging forever if the network or browser cannot load a file.
const OCR_INITIALIZATION_TIMEOUT_MS = 90_000;
const OCR_PREDICTION_TIMEOUT_MS = 30_000;
// A frame takes roughly a second to recognize on a warm phone. Waiting a
// little before taking the next frame keeps one Worker inference in flight,
// rather than queueing frames and making the live preview feel stale.
const LIVE_FRAME_GAP_MS = 180;
const LIVE_EVIDENCE_MAX_FRAMES = 8;
// A live read is evidence gathering, not an unbounded video analytics loop.
// Capping successful inferences prevents long-running WASM/GPU allocations
// from accumulating on iOS and installed Chrome PWAs.
const LIVE_MAX_INFERENCES = 12;
const LIVE_MIN_QUALITY = 0.42;
const LIVE_MIN_DISTINCTNESS = 0.018;
const OCR_MAX_SIDE = 2_000;
// Keep the camera request conservative. Asking a low-memory phone to open a 1080p
// stream can make the PWA terminate the preview before it gets that far.
function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function liveCameraConstraints(mobile: boolean): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: mobile ? 960 : 1280 },
      height: { ideal: mobile ? 540 : 720 },
    },
  };
}
let cachedOcrLanguage = "";
let cachedOcr: Promise<OcrEngine> | null = null;
let cachedOcrWorker: Worker | null = null;
let ocrIdleTimer: ReturnType<typeof setTimeout> | null = null;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function clearOcrIdleTimer() {
  if (ocrIdleTimer) clearTimeout(ocrIdleTimer);
  ocrIdleTimer = null;
}

function disposeCachedOcr() {
  clearOcrIdleTimer();
  const current = cachedOcr;
  const worker = cachedOcrWorker;
  cachedOcr = null;
  cachedOcrWorker = null;
  cachedOcrLanguage = "";
  worker?.terminate();
  if (current) void current.then((ocr) => ocr.dispose()).catch(() => undefined);
}

function disposeCachedOcrLater() {
  clearOcrIdleTimer();
  ocrIdleTimer = setTimeout(disposeCachedOcr, OCR_IDLE_TIMEOUT_MS);
}

function getOcr(language: string) {
  clearOcrIdleTimer();
  if (cachedOcr && cachedOcrLanguage === language) return cachedOcr;
  disposeCachedOcr();
  cachedOcrLanguage = language;
  let attemptWorker: Worker | null = null;
  const initialization = (async () => {
    // PwaRuntime starts this promise during idle time. Awaiting it here makes
    // an early scanner open share that work instead of racing it and creating
    // duplicate model/Worker requests. A failed warm-up is non-fatal: the
    // PaddleOCR loader can still make its normal requests and the bounded
    // timeout below will provide a manual fallback if a required asset is
    // unavailable.
    try {
      await downloadNutritionOcrAssets();
    } catch {
      // Continue with PaddleOCR's direct asset loading.
    }
    // Keep the OCR runtime out of the application shell. Loading starts when
    // barcode mode opens and is shared across scans for five idle minutes.
    const loadPaddle = new Function("return import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm')") as () => Promise<typeof import("@paddleocr/paddleocr-js")>;
    const { PaddleOCR } = await loadPaddle();
    return await PaddleOCR.create({
      lang: language,
      ocrVersion: "PP-OCRv6",
      textDetectionModelName: NUTRITION_OCR_MODEL.detection.name,
      textRecognitionModelName: NUTRITION_OCR_MODEL.recognition.name,
      textDetectionModelAsset: { url: NUTRITION_OCR_MODEL.detection.url },
      textRecognitionModelAsset: { url: NUTRITION_OCR_MODEL.recognition.url },
      ...nutritionOcrSettings(isLikelyMobileDevice()),
      worker: {
        createWorker: () => {
          attemptWorker = new Worker(NUTRITION_OCR_WORKER_URL, { type: "module" });
          cachedOcrWorker = attemptWorker;
          return attemptWorker;
        },
      },
      ortOptions: {
        // Keep repeated live inference on the predictable local WASM backend.
        // WebGPU can be faster for one photo but has caused installed-PWA tab
        // resets after many consecutive Worker inferences on some devices.
        backend: "wasm",
        wasmPaths: NUTRITION_OCR_WASM_PATH,
        numThreads: 1,
        simd: true,
      },
    }) as OcrEngine;
  })();
  const promise = withTimeout(
    initialization,
    OCR_INITIALIZATION_TIMEOUT_MS,
    "The OCR engine took too long to start. Try again, check your connection, or enter the nutrition values manually.",
    () => attemptWorker?.terminate(),
  );
  cachedOcr = promise;
  void initialization.then((ocr) => {
    // If this attempt completed after a timeout or language change, do not
    // leave its Worker and WASM session alive in the background.
    if (cachedOcr !== promise) void ocr.dispose().catch(() => undefined);
  }).catch(() => undefined);
  void promise.catch(() => {
    if (cachedOcr === promise) {
      const worker = cachedOcrWorker;
      cachedOcr = null;
      cachedOcrLanguage = "";
      cachedOcrWorker = null;
      worker?.terminate();
    }
  });
  return promise;
}

export function preloadNutritionOcr(locale: string) {
  void getOcr(languageFor(locale)).then(disposeCachedOcrLater).catch(() => undefined);
}

function languageFor(locale: string) {
  const lang = locale.toLowerCase().split("-")[0];
  if (["de", "cs", "it", "pl", "sk", "tr"].includes(lang)) return lang;
  if (lang === "zh") return "ch";
  // PP-OCR's browser distribution currently has no Ukrainian profile; English
  // remains a useful detector for bilingual labels while values stay editable.
  return "en";
}

function manualNutritionResult(): NutritionScanResult {
  return {
    basis: "per_serving",
    servingLabel: "",
    servingAmount: null,
    servingUnit: null,
    servingGrams: null,
    servingMl: null,
    nutrients: {},
    warnings: ["Enter the values shown on the label and check the nutrition basis before saving."],
    rawLines: [],
    modelVersion: "manual",
    initializationMs: 0,
    durationMs: 0,
  };
}

function cameraError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Camera access was blocked. Allow camera access, then use the live scanner.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No camera was found on this device. Choose a label photo instead.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "The camera is already being used by another app. Close it, then try again.";
  if (error instanceof DOMException && error.name === "OverconstrainedError") return "This camera cannot use the requested settings. Try the live scanner again or choose a photo.";
  if (error instanceof DOMException && error.name === "AbortError") return "The camera stopped while it was opening. Try the live scanner again.";
  if (error instanceof Error && error.message.startsWith("Camera access requires")) return error.message;
  if (error instanceof Error) return `The private scanner could not start: ${error.message}`;
  return "The camera could not start. Choose a label photo or enter the values manually.";
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function startVideoPreview(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await withTimeout(new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("The camera preview could not load.")); };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", ready);
        video.removeEventListener("error", failed);
      };
      video.addEventListener("loadedmetadata", ready, { once:true });
      video.addEventListener("error", failed, { once:true });
    }), 8_000, "The camera preview did not become ready. Try the live scanner again.");
  }
  // Muted, inline video may autoplay on installed iOS PWAs. Do not suppress a
  // rejection here: continuing without visible frames looks like a crashed
  // scanner and makes the later OCR error misleading.
  await video.play();
}

function parseOcrOutput(ocrResult: OcrOutput | undefined, durationMs: number, initializationMs: number, frameQuality?: number) {
  if (!ocrResult) throw new Error("OCR finished without returning a result.");
  return parseNutritionLabel(
    // PaddleOCR occasionally omits a polygon for a low-confidence text item.
    // Keep its text as an unpositioned OCR line instead of allowing one
    // partial item to abort the entire live scan.
    (Array.isArray(ocrResult.items) ? ocrResult.items : []).flatMap((item) => {
      if (!item || typeof item.text !== "string" || !item.text.trim()) return [];
      const poly = Array.isArray(item.poly)
        ? item.poly.flatMap((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [{ x:point[0], y:point[1] }] : [])
        : undefined;
      return [{ text:item.text, score:typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 0, ...(poly && poly.length >= 2 ? { poly } : {}) }];
    }),
    NUTRITION_OCR_MODEL.version,
    durationMs,
    initializationMs,
    { frameQuality },
  );
}

function recognizedNutrients(result: NutritionScanResult) {
  return Object.values(result.nutrients ?? {}).filter((value): value is ScannedNutrient => Boolean(value) && value.amount !== null && Number.isFinite(value.amount)).length;
}

async function preparedImage(file: File, rotation: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation:"from-image" });
  const maxSide = nutritionOcrSettings(isLikelyMobileDevice()).textDetLimitSideLen;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const sideways = rotation % 180 !== 0;
  const width = Math.round((sideways ? bitmap.height : bitmap.width) * scale);
  const height = Math.round((sideways ? bitmap.width : bitmap.height) * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently:true });
  if (!context) throw new Error("This browser cannot prepare the label image.");
  context.filter = "grayscale(1) contrast(1.2)";
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  bitmap.close();
  return canvas;
}

async function readLabelPhoto(file: File, rotation: number, locale: string, onProgress: (message: string) => void) {
  const canvas = await preparedImage(file, rotation);
  try {
    const initializationStarted = performance.now();
    onProgress("Preparing local OCR assets and engine…");
    const ocr = await getOcr(languageFor(locale));
    const initializationMs = Math.round(performance.now() - initializationStarted);
    onProgress("Reading the nutrition table on this device…");
    const predictionStarted = performance.now();
    const [ocrResult] = await withTimeout(
      ocr.predict(canvas),
      OCR_PREDICTION_TIMEOUT_MS,
      "Reading the label took too long. Try a tighter crop or enter the nutrition values manually.",
      disposeCachedOcr,
    );
    const predictionMs = Math.round(performance.now() - predictionStarted);
    disposeCachedOcrLater();
    return parseOcrOutput(ocrResult, predictionMs, initializationMs);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

type FrameQuality = {
  score: number;
  sharpness: number;
  exposure: number;
  glare: number;
  textDensity: number;
  perspective: number;
  fingerprint: number;
};

function frameQuality(video: HTMLVideoElement): FrameQuality | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  let sum = 0;
  let sumSquare = 0;
  let dark = 0;
  let bright = 0;
  let glarePixels = 0;
  let edges = 0;
  let topEdges = 0;
  let bottomEdges = 0;
  const stride = 4;
  const luminanceAt = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
  };
  for (let y = stride; y < canvas.height - stride; y += stride) {
    for (let x = stride; x < canvas.width - stride; x += stride) {
      const offset = (y * canvas.width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const laplacian = Math.abs(luminanceAt(x - stride, y) + luminanceAt(x + stride, y) + luminanceAt(x, y - stride) + luminanceAt(x, y + stride) - 4 * luminance);
      count += 1;
      sum += luminance;
      sumSquare += luminance * luminance;
      if (luminance < 28) dark += 1;
      if (luminance > 235) bright += 1;
      if (luminance > 242 && Math.max(red, green, blue) - Math.min(red, green, blue) < 18) glarePixels += 1;
      if (laplacian > 38) {
        edges += 1;
        if (y < canvas.height / 2) topEdges += 1;
        else bottomEdges += 1;
      }
    }
  }
  canvas.width = 1;
  canvas.height = 1;
  if (!count) return null;
  const mean = sum / count;
  const contrast = Math.max(0, sumSquare / count - mean * mean);
  const darkRatio = dark / count;
  const brightRatio = bright / count;
  const glareRatio = glarePixels / count;
  const edgeRatio = edges / count;
  const sharpness = Math.min(1, contrast / 1_100) * Math.min(1, edgeRatio / 0.16);
  const exposure = Math.min(1, Math.max(0, 1 - Math.abs(mean - 145) / 150)) * Math.min(1, Math.max(0, 1 - Math.max(0, darkRatio - 0.28) * 2.2 - Math.max(0, brightRatio - 0.3) * 2.2));
  const glare = Math.min(1, Math.max(0, 1 - glareRatio / 0.14));
  const textDensity = Math.min(1, Math.max(0, 1 - Math.abs(edgeRatio - 0.16) / 0.16));
  const perspective = edges ? Math.min(1, Math.max(0, 1 - Math.abs(topEdges - bottomEdges) / edges)) : 0;
  const score = sharpness * 0.44 + exposure * 0.22 + glare * 0.17 + textDensity * 0.1 + perspective * 0.07;
  return { score, sharpness, exposure, glare, textDensity, perspective, fingerprint: mean / 255 + contrast / 5_000 + edgeRatio * 1.8 };
}

function preparedVideoFrame(video: HTMLVideoElement, maxSide = OCR_MAX_SIDE) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is not ready yet. Keep the label in view.");
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently:true });
  if (!context) throw new Error("This browser cannot prepare a camera frame.");
  context.filter = "grayscale(1) contrast(1.2)";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropToNutritionPanel(frame: HTMLCanvasElement, bounds: NonNullable<NutritionScanResult["panelBounds"]>) {
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(frame.width, Math.ceil(bounds.right));
  const bottom = Math.min(frame.height, Math.ceil(bounds.bottom));
  const width = right - left;
  const height = bottom - top;
  // Never let a stale detection turn into a narrow scanner window. The panel
  // must be a substantial, plausible part of the full preview; otherwise the
  // next pass keeps the full image.
  if (width < frame.width * 0.18 || height < frame.height * 0.15 || width > frame.width * 0.96 || height > frame.height * 0.96) return null;
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  const context = crop.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(frame, left, top, width, height, 0, 0, width, height);
  return crop;
}

export function NutritionLabelScanner({ locale, onSaved, onClose }: { locale: string; onSaved: (draft: LabelScanDraft) => Promise<void>; onClose: () => void }) {
  const [scanMode, setScanMode] = useState<"barcode" | "label">("barcode");
  const [barcodeFood, setBarcodeFood] = useState<BarcodeFood | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const barcodeRequestRef = useRef<AbortController | null>(null);
  const lookupBarcodeRef = useRef<(value: string) => void>(() => undefined);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<"choose" | "processing" | "error">("choose");
  // Camera permissions in installed PWAs must be requested from a user
  // gesture. Starting on mount works in some desktop browsers but silently
  // fails on others, so the first live scan is explicitly tap-initiated.
  const [liveActive, setLiveActive] = useState(false);
  const [liveState, setLiveState] = useState<"starting" | "preparing" | "scanning" | "stopped" | "error">("stopped");
  const [liveHint, setLiveHint] = useState("");
  const [message, setMessage] = useState("");
  const [liveResult, setLiveResult] = useState<NutritionScanResult | null>(null);
  const [liveEdits, setLiveEdits] = useState<LiveNutrientEdits>({});
  const [servingEdits, setServingEdits] = useState<LiveServingEdits>({});
  const liveDraft = applyLiveNutritionEdits(liveResult ?? manualNutritionResult(), liveEdits, servingEdits);
  const invalidLiveEdits = Object.values(liveEdits).some(({ raw }) => raw.trim() !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0))
    || [liveDraft.servingAmount, liveDraft.servingGrams, liveDraft.servingMl].some((value) => value !== null && (!Number.isFinite(value) || value <= 0));
  const [name, setName] = useState("Scanned food");
  const [brand, setBrand] = useState("");
  const [saving, setSaving] = useState(false);
  const objectUrl = useRef("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopLiveCameraRef = useRef<() => void>(() => undefined);
  const pendingLiveStreamRef = useRef<MediaStream | null>(null);
  const liveRequestRef = useRef(0);
  const liveRequestInFlightRef = useRef(false);
  const modeStartRef = useRef(false);
  const mountedRef = useRef(true);
  const localeRef = useRef(locale);

  useEffect(() => {
    // React Strict Mode deliberately mounts, cleans up, then mounts effects
    // again in development. Resetting this marker in setup keeps a real
    // camera permission grant from being discarded during that check.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      barcodeRequestRef.current?.abort();
      liveRequestRef.current += 1;
      stopLiveCameraRef.current();
      stopMediaStream(pendingLiveStreamRef.current);
      pendingLiveStreamRef.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  useEffect(() => {
    // Starting on scanner open overlaps model setup with taking/choosing the
    // photo. The module-level promise prevents Strict Mode or remounts from
    // initializing a second Worker.
    if (scanMode === "label") preloadNutritionOcr(locale);
  }, [locale, scanMode]);

  useEffect(() => {
    if (!liveActive) return;

    let cancelled = false;
    const mobileDevice = isLikelyMobileDevice();
    const frameGapMs = mobileDevice ? 900 : LIVE_FRAME_GAP_MS;
    const maxInferences = mobileDevice ? 4 : LIVE_MAX_INFERENCES;
    const liveFrameMaxSide = nutritionOcrSettings(mobileDevice).textDetLimitSideLen;
    // startLive obtains this stream while the user gesture is still active;
    // this effect only attaches it to the rendered preview and starts OCR.
    let stream = pendingLiveStreamRef.current;
    pendingLiveStreamRef.current = null;
    let barcodeControls: { stop: () => void } | null = null;
    let nextFrameTimer: number | null = null;
    let lastFingerprint: number | null = null;
    let panelHint: { bounds: NonNullable<NutritionScanResult["panelBounds"]>; confidence: number } | null = null;
    let croppedReadMisses = 0;
    let consecutiveFrameFailures = 0;
    let inferenceCount = 0;
    const evidenceFrames: NutritionScanResult[] = [];

    const stop = () => {
      barcodeControls?.stop();
      barcodeControls = null;
      if (nextFrameTimer) window.clearTimeout(nextFrameTimer);
      nextFrameTimer = null;
      stopMediaStream(stream);
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    stopLiveCameraRef.current = () => { cancelled = true; stop(); };

    const sampleFrame = async (ocr: OcrEngine, initializationMs: number) => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          nextFrameTimer = window.setTimeout(() => void sampleFrame(ocr, initializationMs), frameGapMs);
        return;
      }

      let frame: HTMLCanvasElement | null = null;
      try {
        // Reading pixels from a just-woken mobile video surface can briefly
        // throw even when the camera itself is healthy. That is a skipped
        // frame, not a reason to close the scanner.
        let quality: FrameQuality | null = null;
        try {
          quality = frameQuality(video);
        } catch {
          setLiveHint("Camera is warming up. Keep the label in view…");
          if (!cancelled) nextFrameTimer = window.setTimeout(() => void sampleFrame(ocr, initializationMs), frameGapMs);
          return;
        }
        if (!quality || quality.score < LIVE_MIN_QUALITY) {
          setLiveHint(quality && quality.perspective < 0.3 ? "Hold the label more parallel to the camera…" : "Looking for a sharper, evenly lit nutrition panel…");
          if (!cancelled) nextFrameTimer = window.setTimeout(() => void sampleFrame(ocr, initializationMs), frameGapMs);
          return;
        }
        const isDistinct = lastFingerprint === null || Math.abs(quality.fingerprint - lastFingerprint) >= LIVE_MIN_DISTINCTNESS || evidenceFrames.length < 2;
        if (!isDistinct) {
          setLiveHint("Clear view found. Move the label slightly for another reading…");
          if (!cancelled) nextFrameTimer = window.setTimeout(() => void sampleFrame(ocr, initializationMs), frameGapMs);
          return;
        }
        frame = preparedVideoFrame(video, liveFrameMaxSide);
        const usedPanelHint = panelHint?.confidence && panelHint.confidence >= 0.72
          ? cropToNutritionPanel(frame, panelHint.bounds)
          : null;
        if (usedPanelHint) {
          frame.width = 1;
          frame.height = 1;
          frame = usedPanelHint;
        }
        // Keep the preview running while the worker reads this captured frame.
        // Disabling the camera track produces black frames between reads.
        // Bound OCR memory with the detector size and recognition batch limits.
        const predictionStarted = performance.now();
        inferenceCount += 1;
        const [ocrResult] = await withTimeout(
          ocr.predict(frame),
          OCR_PREDICTION_TIMEOUT_MS,
          "Reading this camera frame took too long.",
          disposeCachedOcr,
        );
        if (cancelled) return;
        if (!ocrResult) {
          setLiveHint("Looking for a clear nutrition table…");
        } else {
          lastFingerprint = quality.fingerprint;
          const parsed = parseOcrOutput(ocrResult, Math.round(performance.now() - predictionStarted), initializationMs, quality.score);
          consecutiveFrameFailures = 0;
          if (!usedPanelHint && parsed.panelBounds && (parsed.panelConfidence ?? 0) >= 0.72) {
            panelHint = { bounds: parsed.panelBounds, confidence: parsed.panelConfidence ?? 0 };
            croppedReadMisses = 0;
          } else if (usedPanelHint && recognizedNutrients(parsed) === 0) {
            croppedReadMisses += 1;
            if (croppedReadMisses >= 2) panelHint = null;
          } else if (usedPanelHint) {
            croppedReadMisses = 0;
          }
          if (recognizedNutrients(parsed) > 0) {
            evidenceFrames.push(parsed);
            if (evidenceFrames.length > LIVE_EVIDENCE_MAX_FRAMES) evidenceFrames.shift();
          }
          const reconciled = reconcileNutritionScans(evidenceFrames, { minimumAgreement: 2, includeUnstable: true });
          if (reconciled) setLiveResult(reconciled);
          const count = recognizedNutrients(parsed);
          const stableCount = reconciled ? Object.values(reconciled.nutrients ?? {}).filter((nutrient) => nutrient?.stable).length : 0;
          setLiveHint(count === 0
            ? "Looking for nutrition values. Keep the complete panel in view…"
            : stableCount
              ? `${stableCount} value${stableCount === 1 ? "" : "s"} confirmed · keep scanning or tap Done`
              : "Reading the label. Move it slightly for a confirming view…");
        }
        if (inferenceCount >= maxInferences) {
          setLiveHint(`Live reading paused after ${maxInferences} frames. Review the values or start another pass.`);
          setLiveState("stopped");
          setLiveActive(false);
          cancelled = true;
          stop();
        }
      } catch (error) {
        if (!cancelled) {
          // A live stream is expected to have occasional incomplete frames
          // while exposure/focus settles. Keep its preview and retry instead
          // of turning an isolated OCR/parse exception into a sheet crash.
          consecutiveFrameFailures += 1;
          if (consecutiveFrameFailures < 3) {
            setLiveHint("That frame was incomplete. Keep the nutrition panel in view…");
          } else {
            setLiveState("error");
            setLiveActive(false);
            setStatus("choose");
            setMessage(error instanceof Error ? `Live scanning paused after repeated read errors: ${error.message}` : "Live scanning paused after repeated read errors. Choose a photo or try again.");
            cancelled = true;
            stop();
          }
        }
      } finally {
        if (frame) { frame.width = 1; frame.height = 1; }
      }
      if (!cancelled) nextFrameTimer = window.setTimeout(() => void sampleFrame(ocr, initializationMs), frameGapMs);
    };

    const start = async () => {
      setLiveState("starting");
      setLiveHint("Starting the live camera…");
      setMessage("");
      try {
        if (!stream) throw new Error("Camera setup was interrupted. Tap Start live scan to try again.");
        if (cancelled || !videoRef.current) { stop(); return; }
        videoRef.current.srcObject = stream;
        await startVideoPreview(videoRef.current);
        if (cancelled) return;

        if (scanMode === "barcode") {
          const { BarcodeFormat, BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled || !stream || !videoRef.current) return;
          const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 500 });
          reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];
          const controls = await reader.decodeFromStream(stream, videoRef.current, (decoded, _error, controls) => {
            const value = decoded?.getText().trim();
            if (!value || cancelled) return;
            cancelled = true;
            controls.stop();
            lookupBarcodeRef.current(value);
          });
          barcodeControls = controls;
          if (cancelled) { stop(); return; }
          setLiveState("scanning");
          setLiveHint("Point at the package barcode…");
          return;
        }

        setLiveState("preparing");
        setLiveHint("Loading the private on-device scanner. Keep the label in frame…");
        const initializationStarted = performance.now();
        const ocr = await getOcr(languageFor(localeRef.current));
        if (cancelled) return;
        setLiveState("scanning");
        setLiveHint("Point at the complete nutrition table. A clear view will be read automatically…");
        void sampleFrame(ocr, Math.round(performance.now() - initializationStarted));
      } catch (error) {
        if (!cancelled) {
          setLiveState("error");
          setLiveActive(false);
          setStatus("choose");
          setMessage(error instanceof Error ? cameraError(error) : "The live scanner could not start. Choose a photo instead.");
          stop();
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
      stopLiveCameraRef.current = () => undefined;
      disposeCachedOcrLater();
    };
  }, [liveActive, scanMode]);

  const stopLive = () => {
    // Invalidate an in-flight getUserMedia promise as well as any active
    // preview. If permission resolves after Stop/Close, its tracks are
    // released instead of reviving a detached scanner.
    liveRequestRef.current += 1;
    liveRequestInFlightRef.current = false;
    stopLiveCameraRef.current();
    stopMediaStream(pendingLiveStreamRef.current);
    pendingLiveStreamRef.current = null;
    setLiveActive(false);
    setLiveState("stopped");
    setLiveHint("");
  };

  const startLive = useCallback(async (restart = false) => {
    if (liveRequestInFlightRef.current || (liveActive && !restart) || lookingUp) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setLiveState("error");
      setMessage("Camera access requires a secure browser connection. Choose a photo instead.");
      return;
    }
    const request = ++liveRequestRef.current;
    liveRequestInFlightRef.current = true;
    setStatus("choose");
    setMessage("");
    setLiveHint("Starting the live camera…");
    setLiveState("starting");
    try {
      // This call deliberately occurs before the first await in the click
      // handler. iOS and installed PWAs preserve permission activation here,
      // whereas an effect that runs after setState may be rejected.
      const stream = await navigator.mediaDevices.getUserMedia(liveCameraConstraints(isLikelyMobileDevice()));
      if (!mountedRef.current || request !== liveRequestRef.current) {
        stopMediaStream(stream);
        return;
      }
      pendingLiveStreamRef.current = stream;
      setLiveActive(true);
    } catch (error) {
      if (mountedRef.current && request === liveRequestRef.current) {
        setLiveState("error");
        setMessage(cameraError(error));
      }
    } finally {
      if (request === liveRequestRef.current) liveRequestInFlightRef.current = false;
    }
  }, [liveActive, lookingUp]);

  const switchMode = (next: "barcode" | "label") => {
    if (next === scanMode || status === "processing") return;
    const restartCamera = liveActive;
    barcodeRequestRef.current?.abort();
    setLookingUp(false);
    stopLive();
    setScanMode(next);
    // A mode change starts a new scan. Do not let a previous barcode result
    // or label draft silently travel into the other scanner type.
    setLiveResult(null);
    setLiveEdits({});
    setServingEdits({});
    setBarcodeFood(null);
    setName("Scanned food");
    setBrand("");
    setMessage("");
    // Preserve an already-running camera when changing modes, but do not
    // request permission from an effect when the scanner is idle. Safari may
    // reject that second request because it no longer has a user gesture.
    modeStartRef.current = restartCamera;
  };

  useEffect(() => {
    if (!modeStartRef.current) return;
    modeStartRef.current = false;
    void startLive(true);
  }, [scanMode, startLive]);

  const lookupBarcode = async (candidate: string) => {
    const value = candidate.trim();
    if (!value) return;
    stopLive();
    barcodeRequestRef.current?.abort();
    const controller = new AbortController();
    barcodeRequestRef.current = controller;
    setLookingUp(true);
    setMessage("");
    if (value !== barcodeFood?.barcode) {
      setLiveResult(null); setLiveEdits({}); setServingEdits({});
      setBarcodeFood(null); setName("Scanned food"); setBrand("");
    }
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/foods/barcode/${encodeURIComponent(value)}`, { signal: controller.signal });
      const food = await response.json() as BarcodeFood & { message?: string };
      if (!response.ok) throw new Error(food.message ?? "No product found. Tap Label to read the nutrition panel.");
      if (controller.signal.aborted || !mountedRef.current) return;
      const parsed = barcodeNutritionResult(food);
      setBarcodeFood({ ...food, barcode: food.barcode ?? value });
      setName(food.name); setBrand(food.brand ?? "");
      setLiveResult(parsed);
      setLiveHint("Product found. Check the values below, then tap Done.");
      if (food.source !== "open_food_facts") void fetch("/api/scanned-foods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogFoodId: food.id }) }).catch(() => undefined);
    } catch (error) {
      if (mountedRef.current && barcodeRequestRef.current === controller) setMessage(controller.signal.aborted ? "Barcode lookup timed out. Try again or tap Label." : error instanceof Error ? error.message : "Barcode lookup failed. Try again or tap Label.");
    } finally {
      window.clearTimeout(timer);
      if (barcodeRequestRef.current === controller && mountedRef.current) setLookingUp(false);
    }
  };
  useEffect(() => { lookupBarcodeRef.current = (value) => { void lookupBarcode(value); }; });

  const saveLiveDraft = async () => {
    if (invalidLiveEdits) {
      setMessage("Enter valid, non-negative nutrition values and a positive serving size.");
      return;
    }
    if (!recognizedNutrients(liveDraft)) {
      setMessage("Keep the nutrition panel in view until at least one value is recognized, or enter it manually.");
      return;
    }
    if (!name.trim()) {
      setMessage("Enter a food name before finishing the scan.");
      return;
    }
    const nutrients = Object.fromEntries(Object.entries(liveDraft.nutrients ?? {}).flatMap(([key, value]) => value?.amount !== null && Number.isFinite(value?.amount) ? [[key, value.amount]] : []));
    if (!Object.keys(nutrients).length) {
      setMessage("Enter at least one valid nutrition value before finishing the scan.");
      return;
    }
    setSaving(true);
    setStatus("processing");
    setMessage("Saving and opening food log…");
    stopLive();
    try {
      await onSaved({ ...(barcodeFood?.barcode ? { barcode: barcodeFood.barcode } : {}), ...(barcodeFood?.sourceUrl ? { sourceUrl: barcodeFood.sourceUrl } : {}), name:name.trim(), brand:brand.trim(), servingGrams:liveDraft.servingGrams, servingMl:liveDraft.servingMl, servingAmount:liveDraft.servingAmount ?? 1, servingUnit:liveDraft.servingUnit ?? (liveDraft.basis === "per_package" ? "package" : "serving"), nutritionBasis:liveDraft.basis, nutrients });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save this private food.");
    } finally {
      setSaving(false);
    }
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;
    stopLive();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(next);
    setLiveEdits({}); setServingEdits({});
    setFile(next); setPreview(objectUrl.current); setRotation(0); setStatus("choose"); setMessage(""); setLiveResult(null);
  };

  const scanPhoto = async () => {
    if (!file) { setMessage("Choose a nutrition-label photo first."); return; }
    stopLive();
    setStatus("processing"); setMessage("Preparing the private on-device scanner…");
    try {
      const parsed = await readLabelPhoto(file, rotation, locale, setMessage);
      setLiveResult(parsed); setStatus("choose"); setMessage("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? `Could not read this label: ${error.message}` : "Could not read this label. You can enter it manually.");
    }
  };

  const liveNutrientCount = recognizedNutrients(liveDraft);
  const liveStableCount = liveResult ? Object.values(liveResult.nutrients ?? {}).filter((nutrient) => nutrient?.stable).length : 0;
  const showLivePreview = liveActive || liveState === "starting" || liveState === "preparing";
  const liveStarting = liveState === "starting" || liveState === "preparing";

  return <div className="nutrition-label-scan nutrition-label-live-layout">
    <div className="nutrition-label-scan-head"><span><ScanLine size={18} /> Scan barcode or nutrition</span><button type="button" className="icon-button" aria-label="Close scanner" onClick={onClose}><X size={18} /></button></div>
    <div className="nutrition-label-capture">
      <div className="scan-camera-stage" aria-busy={liveStarting || lookingUp || status === "processing"}>
        {showLivePreview ? <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
          : preview && scanMode === "label" ? <Image src={preview} alt="Selected nutrition label" width={2000} height={2000} unoptimized style={{ transform: `rotate(${rotation}deg)` }} />
          : <div className="scan-camera-empty">{scanMode === "barcode" ? <Barcode size={36} strokeWidth={1.2} /> : <ScanLine size={36} strokeWidth={1.2} />}<span>{liveNutrientCount ? "Ready for another view" : (scanMode === "barcode" ? "Point at a package barcode" : "Point at the nutrition label")}</span><small>{scanMode === "barcode" ? "Find a product and edit its nutrition" : "Read privately on your device"}</small></div>}
        <div className="scan-camera-topbar">
          <div className="scan-mode-switch" role="group" aria-label="Scan mode"><button type="button" aria-pressed={scanMode === "barcode"} disabled={status === "processing"} onClick={() => switchMode("barcode")}>Barcode</button><button type="button" aria-pressed={scanMode === "label"} disabled={status === "processing"} onClick={() => switchMode("label")}>Label</button></div>
          {scanMode === "label" && <div className="scan-camera-tools">
            <label className="scan-camera-tool" title="Take a photo"><Camera size={18} /><input className="scan-file-input" type="file" disabled={status === "processing"} aria-label="Take a nutrition label photo" accept="image/*" capture="environment" onClick={stopLive} onChange={choose} /></label>
            <label className="scan-camera-tool" title="Choose a photo"><Upload size={18} /><input className="scan-file-input" type="file" disabled={status === "processing"} aria-label="Choose a nutrition label photo" accept="image/*" onClick={stopLive} onChange={choose} /></label>
          </div>}
        </div>
        <div className="scan-camera-bottom">
          <div className="scan-camera-controls">
            {showLivePreview
              ? <button type="button" className="scan-camera-pause" onClick={stopLive}><Square size={13} /> Pause</button>
              : <button type="button" className="scan-camera-start" disabled={status === "processing" || lookingUp} onClick={() => void startLive()}><Camera size={16} /> {liveNutrientCount ? "Scan again" : scanMode === "barcode" ? "Start barcode scan" : "Start label scan"}</button>}
            {preview && scanMode === "label" && !showLivePreview && <><button type="button" className="scan-camera-pause" disabled={status === "processing"} onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate label photo"><RotateCw size={16} /></button><button type="button" className="scan-camera-pause" disabled={status === "processing"} onClick={() => void scanPhoto()}>Read photo</button></>}
            <button type="button" className="scan-camera-done" disabled={!liveNutrientCount || invalidLiveEdits || lookingUp || status === "processing" || saving} onClick={() => void saveLiveDraft()}>Done <ChevronRight size={20} /></button>
          </div>
          <p className="scan-camera-status" role="status">{liveStarting || lookingUp || status === "processing" ? <LoaderCircle className="spin" size={13} /> : <span className={liveActive ? "scan-status-dot active" : "scan-status-dot"} />}{lookingUp ? "Looking up product…" : status === "processing" ? message : liveHint || (liveNutrientCount ? `${liveNutrientCount} values filled · ${liveStableCount} confirmed` : "Scan a label or enter values below")}</p>
        </div>
      </div>
      <NutritionFactsPanel foodName={name} foodBrand={brand} disabled={saving || status === "processing"} onFoodNameChange={setName} onFoodBrandChange={setBrand} draft={liveDraft} edits={liveEdits} onEdit={(key, unit, raw) => setLiveEdits((current) => ({ ...current, [key]: { raw, unit } }))} onServingChange={(edit) => setServingEdits((current) => ({ ...current, ...edit }))} />
    </div>
    {message && status !== "processing" && <p className="food-picker-error" role="alert">{message}</p>}
  </div>;
}
