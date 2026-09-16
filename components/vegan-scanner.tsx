"use client";

import { type FormEvent, useState } from "react";
import { Barcode, ExternalLink, Leaf, LoaderCircle, X } from "lucide-react";
import { BarcodeCameraScanner } from "./barcode-camera-scanner";

type VeganProduct = {
  sourceProductId: string;
  barcode: string | null;
  slug: string | null;
  sourceUrl: string | null;
  name: string | null;
  ingredients: string | null;
  allergens: string | null;
};

type ScanResponse = {
  scannedBarcode: string;
  isVegan: boolean;
  product: VeganProduct | null;
  message?: string;
};

export function VeganScanner({ onClose }: { onClose: () => void }) {
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scanBarcode = async (candidate: string) => {
    const value = candidate.trim();
    if (!value) return;

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/vegan/barcode/${encodeURIComponent(value)}`);
      const data = await response.json() as ScanResponse;
      if (!response.ok) throw new Error(data.message ?? "Vegan barcode lookup failed.");
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Vegan barcode lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const scan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void scanBarcode(barcode);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="vegan-scanner-sheet" role="dialog" aria-modal="true" aria-labelledby="vegan-scanner-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="food-picker-head">
          <span className="round-icon green"><Leaf size={19} /></span>
          <div><span className="eyebrow">Vegan product database</span><h2 id="vegan-scanner-title">Vegan scanner</h2></div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </header>

        <form className="barcode-form" onSubmit={scan}>
          <label htmlFor="vegan-barcode">Scan or enter a package barcode</label>
          <div><input id="vegan-barcode" autoFocus inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="e.g. 00000651511030" /><button className="primary-button" disabled={!barcode.trim() || loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Barcode size={17} />} {loading ? "Checking…" : "Check vegan"}</button></div>
          <BarcodeCameraScanner onDetected={(value) => { setBarcode(value); void scanBarcode(value); }} />
          <small>Works with a camera, hardware barcode scanner or typed barcode. A missing match means the product is not listed in this dataset—not that it is non-vegan.</small>
        </form>

        {error && <p className="food-picker-error" role="alert">{error}</p>}

        {result && result.isVegan && result.product && <article className="vegan-scan-card vegan-match">
          <span className="vegan-scan-icon"><Leaf size={20} /></span>
          <div><span className="eyebrow">Listed as vegan</span><h3>{result.product.name ?? "Unnamed product"}</h3></div>
          <dl>
            <div><dt>Barcode</dt><dd>{result.product.barcode ?? result.scannedBarcode}</dd></div>
            <div><dt>Product record</dt><dd>{result.product.sourceProductId}</dd></div>
            {result.product.slug && <div><dt>Slug</dt><dd>{result.product.slug}</dd></div>}
          </dl>
          {result.product.ingredients && <section><h4>Ingredients</h4><p>{result.product.ingredients}</p></section>}
          {result.product.allergens && <section><h4>Allergens</h4><p>{result.product.allergens}</p></section>}
          {result.product.sourceUrl && <a className="vegan-source-link" href={result.product.sourceUrl} target="_blank" rel="noreferrer">View product source <ExternalLink size={14} /></a>}
        </article>}

        {result && !result.isVegan && <article className="vegan-scan-card vegan-no-match">
          <span className="vegan-scan-icon"><Barcode size={20} /></span>
          <div><span className="eyebrow">No vegan listing</span><h3>We could not match this barcode</h3><p>This is not a non-vegan verdict; it just is not present in the imported vegan product data.</p></div>
        </article>}
      </section>
    </div>
  );
}
