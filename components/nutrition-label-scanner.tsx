"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Copy, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import { parseNutritionLabel, type ParsedNutritionLabel } from "../lib/nutrition-parser";
import { recognizeNutritionLabel, type BrowserOcrResult } from "../lib/paddle-ocr";
import styles from "./nutrition-label-scanner.module.css";

interface Props {
  onClose: () => void;
}

interface ScanResult {
  ocr: BrowserOcrResult;
  nutrition: ParsedNutritionLabel;
}

export function NutritionLabelScanner({ onClose }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const structuredJson = useMemo(() => {
    if (!result) return "";
    return JSON.stringify(
      {
        nutrition: result.nutrition,
        ocr: {
          image: result.ocr.image,
          items: result.ocr.items,
          metrics: result.ocr.metrics,
          runtime: result.ocr.runtime,
        },
      },
      null,
      2,
    );
  }, [result]);

  async function scan(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image of a Nutrition Facts label.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setProcessing(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const ocr = await recognizeNutritionLabel(file);
      if (!ocr.items.length) throw new Error("No text was detected. Try a closer, sharper photo.");
      setResult({ ocr, nutrition: parseNutritionLabel(ocr.items) });
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "OCR failed.";
      setError(`${message} The first scan also needs internet access to load the browser OCR runtime and models.`);
    } finally {
      setProcessing(false);
    }
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await scan(file);
  }

  async function copyJson() {
    if (!structuredJson) return;
    await navigator.clipboard.writeText(structuredJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const canOverlay = result && result.ocr.image.width > 0 && result.ocr.image.height > 0;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="nutrition-scan-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <p>On-device OCR</p>
            <h2 id="nutrition-scan-title">Scan a nutrition label</h2>
            <p>Take a clear, straight photo of the Nutrition Facts panel.</p>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close scanner"><X size={20} /></button>
        </header>

        <div className={styles.body}>
          <div className={styles.actions}>
            <button className={styles.primaryButton} disabled={processing} onClick={() => cameraInput.current?.click()}>
              <Camera size={19} /> Take photo
            </button>
            <button className={styles.secondaryButton} disabled={processing} onClick={() => libraryInput.current?.click()}>
              <ImagePlus size={19} /> Choose image
            </button>
            <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={onFileChange} />
            <input ref={libraryInput} hidden type="file" accept="image/*" onChange={onFileChange} />
          </div>

          <p className={styles.helper}>The image is processed in your browser. No nutrition-label image is uploaded to this app’s server.</p>

          <div className={styles.preview}>
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Nutrition label selected for OCR" />
                {canOverlay && (
                  <svg className={styles.overlay} viewBox={`0 0 ${result.ocr.image.width} ${result.ocr.image.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    {result.ocr.items.map((item, index) => (
                      <polygon key={`${item.text}-${index}`} points={item.poly.map(([x, y]) => `${x},${y}`).join(" ")} />
                    ))}
                  </svg>
                )}
              </>
            ) : (
              <div className={styles.emptyPreview}><div><ScanLine size={44} /><p>Nutrition Facts label preview</p></div></div>
            )}
          </div>

          {processing && <div className={styles.processing}><Loader2 className={styles.spin} size={20} /> Loading PaddleOCR and reading the label…</div>}
          {error && <div className={styles.error} role="alert">{error}</div>}

          {result && (
            <>
              <div className={styles.summary}>
                <div className={styles.stat}><span>Calories</span><strong>{result.nutrition.calories ?? "—"}</strong></div>
                <div className={styles.stat}><span>Parsed fields</span><strong>{result.nutrition.parsedFieldCount}</strong></div>
                <div className={styles.stat}><span>OCR confidence</span><strong>{Math.round(result.nutrition.ocrConfidence * 100)}%</strong></div>
              </div>

              <section className={styles.panel}>
                <div className={styles.panelHeader}><strong>OCR text</strong><span className={styles.meta}>{result.ocr.items.length} boxes</span></div>
                <div className={styles.rows}>
                  {result.nutrition.rows.map((row, index) => <div className={styles.row} key={`${row}-${index}`}><span>{index + 1}</span><span>{row}</span></div>)}
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <strong>Structured nutrition JSON</strong>
                  <button className={styles.secondaryButton} onClick={copyJson}>{copied ? <CheckCircle2 size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy JSON"}</button>
                </div>
                <pre className={styles.json}>{structuredJson}</pre>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
