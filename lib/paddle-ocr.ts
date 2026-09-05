import type { OcrItem, OcrPoint } from "./nutrition-parser";

const PADDLE_OCR_ESM = "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

// PaddleOCR's default model host can be extremely slow outside China.
// These are byte-for-byte mirrors of the official PP-OCRv6 tiny archives.
const DET_MODEL_URL =
  "https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv6_tiny_det_onnx_infer.tar";
const REC_MODEL_URL =
  "https://huggingface.co/LunarOilRig/paddleocr-onnx/resolve/main/PP-OCRv6_tiny_rec_onnx_infer.tar";

const INIT_TIMEOUT_MS = 45_000;

type PaddleResultItem = {
  text?: unknown;
  score?: unknown;
  poly?: unknown;
};

type PaddleResult = {
  image?: { width?: number; height?: number };
  items?: PaddleResultItem[];
  metrics?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
};

type PaddleInstance = {
  predict: (image: Blob, params?: Record<string, unknown>) => Promise<PaddleResult[]>;
};

type PaddleModule = {
  PaddleOCR: {
    create: (options: Record<string, unknown>) => Promise<PaddleInstance>;
  };
};

export interface BrowserOcrResult {
  image: { width: number; height: number };
  items: OcrItem[];
  metrics: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

let ocrPromise: Promise<PaddleInstance> | null = null;

function importFromUrl(url: string): Promise<PaddleModule> {
  const importer = new Function("url", "return import(url)") as (moduleUrl: string) => Promise<PaddleModule>;
  return importer(url);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizePoly(value: unknown): OcrPoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point): OcrPoint | null => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const x = Number(point[0]);
      const y = Number(point[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    })
    .filter((point): point is OcrPoint => point !== null);
}

async function getOcr(): Promise<PaddleInstance> {
  if (!ocrPromise) {
    ocrPromise = withTimeout(
      (async () => {
        const { PaddleOCR } = await importFromUrl(PADDLE_OCR_ESM);
        return PaddleOCR.create({
          lang: "en",
          textDetectionModelName: "PP-OCRv6_tiny_det",
          textDetectionModelAsset: { url: DET_MODEL_URL },
          textRecognitionModelName: "PP-OCRv6_tiny_rec",
          textRecognitionModelAsset: { url: REC_MODEL_URL },
          ortOptions: {
            backend: "wasm",
            wasmPaths: ORT_WASM_PATH,
            numThreads: 1,
            simd: true,
          },
        });
      })(),
      INIT_TIMEOUT_MS,
      "PaddleOCR initialization timed out after 45 seconds. Check the browser Network tab for a blocked model or WASM request.",
    ).catch((error) => {
      ocrPromise = null;
      throw error;
    });
  }

  return ocrPromise;
}

export async function recognizeNutritionLabel(image: Blob): Promise<BrowserOcrResult> {
  const ocr = await getOcr();
  const [result] = await ocr.predict(image, {
    textDetLimitSideLen: 1280,
    textDetBoxThresh: 0.45,
    textRecScoreThresh: 0.35,
  });

  if (!result) throw new Error("PaddleOCR returned no result.");

  const items: OcrItem[] = (result.items ?? [])
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim() : "",
      score: Number(item.score ?? 0),
      poly: normalizePoly(item.poly),
    }))
    .filter((item) => item.text.length > 0 && item.poly.length >= 3);

  return {
    image: {
      width: Number(result.image?.width ?? 0),
      height: Number(result.image?.height ?? 0),
    },
    items,
    metrics: result.metrics ?? {},
    runtime: result.runtime ?? {},
  };
}
