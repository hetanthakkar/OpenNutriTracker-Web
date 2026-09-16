import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { PaddleOCR, type PaddleOCRCreateOptions } from "@paddleocr/paddleocr-js";
import { nutritionOcrSettings } from "../lib/nutrition-ocr-settings.ts";

// Exercise the pinned SDK's option resolution and the actual shipped worker's
// resize code. Stop at cv.resize so the regression never allocates giant WASM
// tensors or needs a real camera. This also catches upstream default changes.
const worker = readFileSync(new URL("../public/ocr-assets/v1/worker-entry-C9UNuyOJ.js", import.meta.url), "utf8");
const start = worker.indexOf("function preprocessSample$1(");
const end = worker.indexOf("\nfunction getDetMap(", start);
assert.ok(start >= 0 && end > start, "Update the resize probe if the vendored worker changes");
const preprocess = runInNewContext(`(${worker.slice(start, end)})`, {
  clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
});

async function detectorSize(options: PaddleOCRCreateOptions, width: number, height: number) {
  const ocr = await PaddleOCR.create({ ...options, initialize: false });
  // Internal resolved configuration is inspected only in this SDK integration test.
  const { runtimeDefaults } = ocr as unknown as { runtimeDefaults: Record<string, number | string> };
  let size = { width: 0, height: 0 };
  const stop = new Error("Resize captured before allocation");
  const cv = {
    Mat: class {},
    Size: class {
      width: number;
      height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; }
    },
    resize: (_source: unknown, _target: unknown, next: typeof size) => { size = next; throw stop; },
  };
  assert.throws(() => preprocess({ cv }, { cols: width, rows: height }, {
    limitSideLen: runtimeDefaults.text_det_limit_side_len,
    limitType: runtimeDefaults.text_det_limit_type,
    maxSideLimit: runtimeDefaults.text_det_max_side_limit,
  }), (error: unknown) => error === stop);
  await ocr.dispose();
  return size;
}

test("reproduces the old setting enlarging a phone frame to seven megapixels", async () => {
  const size = await detectorSize({ textDetLimitSideLen: 2_000 }, 960, 540);
  assert.equal(size.width, 3_552);
  assert.equal(size.height, 2_016);
  assert.ok(size.width * size.height > 13 * 960 * 540);
});

test("mobile OCR keeps landscape, portrait, and panel crops within the frame budget", async () => {
  for (const [width, height] of [[960, 540], [540, 960], [320, 160], [1920, 1080]]) {
    const size = await detectorSize(nutritionOcrSettings(true), width, height);
    assert.ok(Math.max(size.width, size.height) <= 960);
    // The detector rounds dimensions to its 32-pixel stride.
    assert.ok(size.width <= width + 16 && size.height <= height + 16);
  }
});

test("desktop OCR also avoids enlarging camera frames", async () => {
  const size = await detectorSize(nutritionOcrSettings(false), 1280, 720);
  assert.equal(size.width, 1280);
  assert.equal(size.height, 736);
});
