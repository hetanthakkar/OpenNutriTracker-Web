/** Client-only, deterministic normalization for nutrition-label OCR. */
export type NutritionBasis = "per_serving" | "per_100g" | "per_100ml" | "per_package";

export type ScanBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type NutritionColumnEvidence = {
  basis: NutritionBasis;
  label: string;
  bounds?: ScanBounds;
  confidence: number;
};

export type ScannedNutrient = {
  amount: number | null;
  unit: "kcal" | "g" | "mg" | "ug";
  rawText: string;
  ocrConfidence: number;
  parserConfidence: number;
  derived?: boolean;
  qualifier?: "lt";
  /** Session-only evidence for the editable review UI. */
  bounds?: ScanBounds;
  basis?: NutritionBasis;
  column?: "nutrition" | "daily_value";
  frameCount?: number;
  agreement?: number;
  stable?: boolean;
};

export type OcrLine = { text: string; score: number; poly?: { x: number; y: number }[] };

export type NutritionScanResult = {
  basis: NutritionBasis;
  servingLabel: string;
  servingAmount: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  servingMl: number | null;
  nutrients: Record<string, ScannedNutrient>;
  warnings: string[];
  rawLines: OcrLine[];
  modelVersion: string;
  initializationMs: number;
  durationMs: number;
  panelBounds?: ScanBounds;
  panelConfidence?: number;
  columns?: NutritionColumnEvidence[];
  frameQuality?: number;
  frameCount?: number;
};

export type NutritionParseOptions = { frameQuality?: number };
export type NutritionReconcileOptions = { minimumAgreement?: number; includeUnstable?: boolean };

const nutrientAliases: Array<[string, string, "kcal" | "g" | "mg" | "ug"]> = [
  ["energy|calories|calorie|energie|energia|energi|kalorie|kalorii|kalori|热量|能量", "energy_kcal", "kcal"],
  ["saturated\\s+fat|sat(?:urated)?\\.?\\s*fat|gesattigte|saturadas|saturi|nasycen|doymuş|насичен|饱和脂肪", "saturated_fat_g", "g"],
  ["trans\\s+fat|transfett|grasas?\\s+trans|gras?si\\s+trans|trans\\s+tuk|транс|反式脂肪", "trans_fat_g", "g"],
  ["total\\s+fat|fat\\b|fett|grasas?\\b|grassi|tuk|yağ|жир|脂肪", "total_fat_g", "g"],
  ["cholesterol|colesterol|colesterolo|холестерин|胆固醇", "cholesterol_mg", "mg"],
  ["sodium|natrium|sodio|sodiu|sodík|sód|натрий|钠", "sodium_mg", "mg"],
  ["salt\\b|sel\\b|sal\\b|soľ|sól\\b|tuz\\b|соль|盐", "salt_g", "g"],
  ["total\\s+carb|carbohydrate|carb\\b|kohlenhydrat|carbohidr|carboidrat|saccharid|węglowodan|углевод|碳水", "carbohydrate_g", "g"],
  ["dietary\\s+fiber|dietary\\s+fibre|fibre|fiber|ballaststoff|błonnik|vláknina|lif|клетчатк|膳食纤维", "dietary_fiber_g", "g"],
  ["added\\s+sugar|added\\s+sugars|zugefügte\\s+zucker|azucares?\\s+anadid|zuccheri\\s+aggiunt|cukry\\s+dodane|добавленн.*сахар|添加糖", "source_added_sugars_g", "g"],
  ["total\\s+sugar|sugars?\\b|zucker|azucares?|zuccheri|cukry|şeker|сахар|糖", "total_sugars_g", "g"],
  ["protein|eiweiß|protéin|proteine|białko|bielkovin|proteinler|белок|蛋白质", "protein_g", "g"],
  ["vitamin\\s*d|vitamina\\s*d|witamina\\s*d|вітамін\\s*d|维生素d", "vitamin_d_d2_d3_ug", "ug"],
  ["calcium|calcio|wapń|vápnik|kalsiyum|кальций|钙", "calcium_mg", "mg"],
  ["iron|eisen|hierro|ferro|żelazo|demir|железо|铁", "iron_mg", "mg"],
  ["potassium|kalium|potasio|potassio|potas|draslík|potasyum|калий|钾", "potassium_mg", "mg"],
];

const servingPattern = /(serving\s*size|portion|per\s*serving|pro\s*portion|porzione|porcja|porsiyon|порц|每份|份量|amount\s+per\s+serving)\s*[:：]?\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)\s*(g|ml|mL|oz|cup|tbsp|piece|pcs?|portion|份)?/i;
const measurementPattern = /(<)?\s*(\d+(?:[.,]\d+)?)\s*(kcal|cal|kj|ml|mg|mcg|μg|µg|ug|g)\b/gi;
const bareNumberPattern = /(?:^|[^\d])(<)?\s*(\d+(?:[.,]\d+)?)(?!\s*%)/g;

type PositionedLine = { line: OcrLine; bounds: ScanBounds };
type VisualRow = {
  entries: PositionedLine[];
  cells: Array<{ text: string; score: number; bounds?: ScanBounds }>;
  text: string;
  score: number;
  bounds?: ScanBounds;
};
type AmountToken = { amount: number; unit?: string; qualifier?: "lt"; raw: string; start: number; bounds?: ScanBounds };

function clamp(value: number, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }

function lineBounds(line: OcrLine): ScanBounds | null {
  const points = line.poly?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? [];
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function combinedBounds(bounds: Array<ScanBounds | undefined>) {
  const present = bounds.filter((value): value is ScanBounds => Boolean(value));
  if (!present.length) return undefined;
  const left = Math.min(...present.map((value) => value.left));
  const right = Math.max(...present.map((value) => value.right));
  const top = Math.min(...present.map((value) => value.top));
  const bottom = Math.max(...present.map((value) => value.bottom));
  return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function expandedBounds(bounds: ScanBounds, padding = 0.1): ScanBounds {
  const horizontal = bounds.width * padding;
  const vertical = bounds.height * padding;
  const left = Math.max(0, bounds.left - horizontal);
  const right = bounds.right + horizontal;
  const top = Math.max(0, bounds.top - vertical);
  const bottom = bounds.bottom + vertical;
  return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Reconstruct an OCR table by grouping cells that share a visual baseline. */
function visualRows(lines: OcrLine[]): VisualRow[] {
  const positioned = lines.flatMap((line) => {
    const bounds = lineBounds(line);
    return bounds ? [{ line, bounds }] : [];
  }).toSorted((a, b) => a.bounds.centerY - b.bounds.centerY || a.bounds.left - b.bounds.left);
  const rows: Array<{ entries: PositionedLine[]; centerY: number; averageHeight: number }> = [];

  for (const entry of positioned) {
    let best: (typeof rows)[number] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(entry.bounds.centerY - row.centerY);
      const threshold = Math.max(4, Math.min(24, Math.max(entry.bounds.height, row.averageHeight) * 0.72));
      if (distance <= threshold && distance < bestDistance) { best = row; bestDistance = distance; }
    }
    if (!best) { rows.push({ entries: [entry], centerY: entry.bounds.centerY, averageHeight: entry.bounds.height }); continue; }
    best.entries.push(entry);
    best.centerY = best.entries.reduce((sum, item) => sum + item.bounds.centerY, 0) / best.entries.length;
    best.averageHeight = best.entries.reduce((sum, item) => sum + item.bounds.height, 0) / best.entries.length;
  }

  const positionedRows = rows.map((row) => {
    const entries = row.entries.toSorted((a, b) => a.bounds.left - b.bounds.left);
    return {
      entries,
      cells: entries.map((entry) => ({ text: entry.line.text.trim(), score: entry.line.score, bounds: entry.bounds })),
      text: entries.map((entry) => entry.line.text.trim()).filter(Boolean).join(" "),
      score: Math.min(...entries.map((entry) => entry.line.score)),
      bounds: combinedBounds(entries.map((entry) => entry.bounds)),
    };
  });
  const unpositionedRows = lines.filter((line) => !lineBounds(line) && line.text.trim()).map((line) => ({
    entries: [], cells: [{ text: line.text.trim(), score: line.score }], text: line.text.trim(), score: line.score,
  }));
  return [...positionedRows, ...unpositionedRows];
}

function finite(value: string) {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",") && !compact.includes(".")
    // Nutrition labels almost never show three decimal places, while 1,200
    // kJ is common. Treat that shape as a thousands separator.
    ? (/^\d{1,3}(?:,\d{3})+$/.test(compact) ? compact.replaceAll(",", "") : compact.replace(",", "."))
    : compact.replaceAll(",", "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function basisFor(lines: string[]): NutritionBasis {
  const text = lines.join(" ").toLocaleLowerCase();
  // A Canadian/US panel can include an informational per-100g column beside
  // the primary Amount per Serving column. Prefer the serving column when the
  // panel advertises Daily Value or Nutrition Facts semantics.
  if (/(amount\s+per\s+serving|per\s+serving)/.test(text) && /(nutrition\s+facts|daily\s*value|%\s*dv|serving\s*size)/.test(text)) return "per_serving";
  if (/per\s*100\s*ml|pro\s*100\s*ml|por\s*100\s*ml|100\s*毫升/.test(text)) return "per_100ml";
  if (/per\s*100\s*g|pro\s*100\s*g|por\s*100\s*g|100\s*克/.test(text)) return "per_100g";
  if (/per\s*(package|pack)|whole\s*pack|per\s*container|每包/.test(text)) return "per_package";
  return "per_serving";
}

function basisFromHeader(text: string): NutritionBasis | null {
  const normalized = text.toLocaleLowerCase();
  if (/per\s*100\s*ml|pro\s*100\s*ml|por\s*100\s*ml/.test(normalized)) return "per_100ml";
  if (/per\s*100\s*g|pro\s*100\s*g|por\s*100\s*g/.test(normalized)) return "per_100g";
  if (/per\s*(package|pack)|per\s*container|whole\s*pack/.test(normalized)) return "per_package";
  if (/amount\s+per\s+serving|per\s+serving|serving\s+size|amount\s+per/.test(normalized)) return "per_serving";
  return null;
}

function nutritionColumns(rows: VisualRow[], fallback: NutritionBasis): NutritionColumnEvidence[] {
  const columns: NutritionColumnEvidence[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      const basis = basisFromHeader(cell.text);
      if (!basis || /daily\s*value|%\s*(daily|dv)|%\s*valeur|%\s*vd/.test(cell.text)) continue;
      const duplicate = columns.find((column) => column.basis === basis && (!column.bounds || !cell.bounds || Math.abs(column.bounds.centerX - cell.bounds.centerX) < 32));
      if (!duplicate) columns.push({ basis, label: cell.text, bounds: cell.bounds, confidence: cell.bounds ? 0.96 : 0.7 });
    }
  }
  return columns.length ? columns : [{ basis: fallback, label: fallback.replaceAll("_", " "), confidence: 0.55 }];
}

function amountTokens(text: string, bounds?: ScanBounds, allowBareEnergy = false): AmountToken[] {
  const tokens: AmountToken[] = [];
  measurementPattern.lastIndex = 0;
  for (let match = measurementPattern.exec(text); match; match = measurementPattern.exec(text)) {
    const amount = finite(match[2]);
    if (amount !== null) tokens.push({ amount, unit: match[3], qualifier: match[1] ? "lt" : undefined, raw: match[0].trim(), start: match.index, bounds });
  }
  if (tokens.length || !allowBareEnergy) return tokens;
  bareNumberPattern.lastIndex = 0;
  for (let match = bareNumberPattern.exec(text); match; match = bareNumberPattern.exec(text)) {
    const amount = finite(match[2]);
    if (amount !== null) tokens.push({ amount, qualifier: match[1] ? "lt" : undefined, raw: match[0].trim(), start: match.index, bounds });
  }
  return tokens;
}

function aliasFor(text: string) { return nutrientAliases.find(([pattern]) => new RegExp(pattern, "i").test(text)); }

function rowValueText(row: VisualRow, aliasIndex: number) {
  const nonDvCells = row.cells.filter((cell) => !/%\s*(?:daily|dv|valeur)|\d+(?:[.,]\d+)?\s*%/.test(cell.text));
  if (nonDvCells.length > 1) {
    const labelCell = nonDvCells.find((cell) => aliasFor(cell.text));
    const valueCells = nonDvCells.filter((cell) => cell !== labelCell && (!labelCell?.bounds || !cell.bounds || cell.bounds.centerX >= labelCell.bounds.centerX - 4));
    if (valueCells.length) return { text: valueCells.map((cell) => cell.text).join(" "), bounds: combinedBounds(valueCells.map((cell) => cell.bounds)), cells: valueCells };
  }
  return { text: row.text.slice(Math.max(0, aliasIndex)), bounds: row.bounds };
}

function preferredColumn(tokens: AmountToken[], columns: NutritionColumnEvidence[], fallback: NutritionBasis) {
  const usable = columns.filter((column) => column.basis !== "per_package" || columns.length === 1);
  const preferred = usable.find((column) => column.basis === fallback) ?? usable[0];
  if (!preferred?.bounds || tokens.length < 2) return preferred;
  const closest = tokens.toSorted((left, right) => Math.abs((left.bounds?.centerX ?? preferred.bounds!.centerX) - preferred.bounds!.centerX) - Math.abs((right.bounds?.centerX ?? preferred.bounds!.centerX) - preferred.bounds!.centerX))[0];
  return closest ? { ...preferred, bounds: closest.bounds ?? preferred.bounds } : preferred;
}

function normalizedValue(key: string, expectedUnit: ScannedNutrient["unit"], token: AmountToken, row: VisualRow, basis: NutritionBasis, columns: NutritionColumnEvidence[]): ScannedNutrient | null {
  let unit = token.unit?.toLowerCase().replace("μ", "u").replace("µ", "u").replace("mcg", "ug") as ScannedNutrient["unit"] | "kj" | "cal" | undefined;
  let amount = token.amount;
  let derived = false;
  if (key === "energy_kcal" && !unit) unit = "kcal";
  if (unit === "kj") { amount /= 4.184; unit = "kcal"; derived = true; }
  if (unit === "cal") unit = "kcal";
  if (unit === "mg" && expectedUnit === "g") { amount /= 1000; unit = "g"; derived = true; }
  if (unit === "g" && expectedUnit === "mg") { amount *= 1000; unit = "mg"; derived = true; }
  if (unit !== expectedUnit) return null;
  const selectedColumn = preferredColumn([token], columns, basis);
  const positioned = Boolean(row.bounds && token.bounds);
  return {
    amount: Number(amount.toFixed(4)), unit: expectedUnit, rawText: row.text, ocrConfidence: row.score,
    parserConfidence: clamp(row.score * (positioned ? 0.99 : 0.9) * (token.unit || key === "energy_kcal" ? 1 : 0.82)),
    derived, qualifier: token.qualifier, bounds: token.bounds ?? row.bounds, basis: selectedColumn?.basis ?? basis,
    column: "nutrition", frameCount: 1, agreement: 100, stable: true,
  };
}

function parseRow(row: VisualRow, basis: NutritionBasis, columns: NutritionColumnEvidence[]) {
  const normalized = row.text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const alias = aliasFor(normalized);
  if (!alias) return null;
  const [, key, expectedUnit] = alias;
  const aliasIndex = normalized.search(new RegExp(alias[0], "i"));
  const valueArea = rowValueText(row, aliasIndex);
  const cellTokens = valueArea.cells?.flatMap((cell) => amountTokens(cell.text, cell.bounds, key === "energy_kcal")) ?? [];
  const tokens = (cellTokens.length ? cellTokens : amountTokens(valueArea.text, valueArea.bounds, key === "energy_kcal"))
    .filter((token) => !/%/.test(token.raw));
  if (!tokens.length) return null;
  const column = preferredColumn(tokens, columns, basis);
  const token = column?.bounds && tokens.length > 1
    ? tokens.toSorted((left, right) => Math.abs((left.bounds?.centerX ?? column.bounds!.centerX) - column.bounds!.centerX) - Math.abs((right.bounds?.centerX ?? column.bounds!.centerX) - column.bounds!.centerX))[0]
    : tokens[0];
  const value = normalizedValue(key, expectedUnit, token, row, column?.basis ?? basis, columns);
  return value ? { key, value } : null;
}

function servingFrom(rows: VisualRow[]) {
  const row = rows.find((candidate) => /serving\s*size|portion|porzione|porcja|porsiyon|порц|每份|份量/i.test(candidate.text))
    ?? rows.find((candidate) => /amount\s+per\s+serving/i.test(candidate.text));
  if (!row) return { servingLabel: "", servingAmount: null, servingUnit: null, servingGrams: null, servingMl: null };
  const match = servingPattern.exec(row.text);
  const amount = match ? finite(match[2].split("/")[0].trim()) : null;
  const unit = match?.[3]?.toLowerCase() ?? null;
  const mass = amountTokens(row.text).find((token) => /^(g|ml)$/i.test(token.unit ?? ""));
  const massUnit = mass?.unit?.toLowerCase();
  return { servingLabel: row.text, servingAmount: amount, servingUnit: massUnit ?? unit, servingGrams: massUnit === "g" ? mass?.amount ?? null : unit === "g" ? amount : null, servingMl: massUnit === "ml" ? mass?.amount ?? null : unit === "ml" ? amount : null };
}

export function parseNutritionLabel(lines: OcrLine[], modelVersion: string, durationMs: number, initializationMs = 0, options: NutritionParseOptions = {}): NutritionScanResult {
  const normalizedLines = lines.filter((line) => line.text.trim()).toSorted((a, b) => (lineBounds(a)?.top ?? 0) - (lineBounds(b)?.top ?? 0));
  const rows = visualRows(normalizedLines);
  const basis = basisFor(rows.map((row) => row.text));
  const columns = nutritionColumns(rows, basis);
  const nutrients: Record<string, ScannedNutrient> = {};
  const nutrientRows: VisualRow[] = [];
  for (const row of rows) {
    const parsed = parseRow(row, basis, columns);
    if (!parsed) continue;
    nutrientRows.push(row);
    if (!(parsed.key in nutrients) || nutrients[parsed.key].parserConfidence < parsed.value.parserConfidence) nutrients[parsed.key] = parsed.value;
  }
  const salt = nutrients.salt_g;
  if (!nutrients.sodium_mg && salt?.amount != null) nutrients.sodium_mg = { ...salt, amount: Number((salt.amount * 400).toFixed(3)), unit: "mg", derived: true, parserConfidence: Math.min(salt.parserConfidence, 0.8) };
  delete nutrients.salt_g;
  const serving = servingFrom(rows);
  const panel = combinedBounds(nutrientRows.map((row) => row.bounds));
  const panelConfidence = clamp((nutrientRows.length / 5) * 0.7 + (panel ? 0.3 : 0));
  const warnings: string[] = [];
  if (Object.keys(nutrients).length < 3) warnings.push("Only a few nutrients were recognized. Keep the full nutrition panel in view or check every value before saving.");
  if (!serving.servingLabel && basis === "per_serving") warnings.push("Serving size was not recognized. Enter it before saving if the label is per serving.");
  if (Object.values(nutrients).some((value) => value?.qualifier || (value?.parserConfidence ?? 0) < 0.9 || value?.derived)) warnings.push("Highlighted values were inferred or uncertain and need review.");
  const totalFat = nutrients.total_fat_g?.amount;
  const saturatedFat = nutrients.saturated_fat_g?.amount;
  if (totalFat != null && saturatedFat != null && saturatedFat > totalFat) warnings.push("Saturated fat exceeds total fat; verify the values.");
  return { basis, ...serving, nutrients, warnings, rawLines: normalizedLines, modelVersion, initializationMs, durationMs, panelBounds: panel ? expandedBounds(panel) : undefined, panelConfidence, columns, frameQuality: options.frameQuality, frameCount: 1 };
}

type KnownNutrient = ScannedNutrient & { amount: number };
function hasAmount(value: ScannedNutrient | undefined): value is KnownNutrient { return value?.amount !== null && value?.amount !== undefined && Number.isFinite(value.amount); }

function matchingAmount(left: KnownNutrient, right: KnownNutrient) {
  if (left.unit !== right.unit || left.qualifier !== right.qualifier || left.basis !== right.basis) return false;
  const minimumTolerance = left.unit === "g" ? 0.05 : left.unit === "ug" ? 0.1 : 1;
  return Math.abs(left.amount - right.amount) <= Math.max(minimumTolerance, Math.max(Math.abs(left.amount), Math.abs(right.amount)) * 0.025);
}

function scanQuality(scan: NutritionScanResult) {
  const frameQuality = scan.frameQuality ?? 0.65;
  return Object.values(scan.nutrients ?? {}).reduce((total, nutrient) => total + (hasAmount(nutrient) ? (1 + nutrient.parserConfidence) * frameQuality : 0), 0);
}

function mostFrequent<T extends string>(values: T[], fallback: T) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let winner = fallback;
  let highest = 0;
  for (const [value, count] of counts) if (count > highest) { winner = value; highest = count; }
  return winner;
}

function resolveReconcileOptions(value: number | NutritionReconcileOptions | undefined) {
  return typeof value === "number" ? { minimumAgreement: value, includeUnstable: false } : { minimumAgreement: value?.minimumAgreement ?? 2, includeUnstable: value?.includeUnstable ?? false };
}

/** Reconcile live OCR passes while preserving marked, one-frame candidates for preview. */
export function reconcileNutritionScans(scans: NutritionScanResult[], options?: number | NutritionReconcileOptions): NutritionScanResult | null {
  const { minimumAgreement, includeUnstable } = resolveReconcileOptions(options);
  if (!scans.length) return null;
  const rankedScans = scans.toSorted((left, right) => scanQuality(right) - scanQuality(left));
  const basis = mostFrequent(scans.map((scan) => scan.basis), rankedScans[0].basis);
  const base = rankedScans.find((scan) => scan.basis === basis) ?? rankedScans[0];
  const nutrientKeys = new Set(scans.flatMap((scan) => Object.keys(scan.nutrients ?? {})));
  const nutrients: Record<string, ScannedNutrient> = {};

  for (const key of nutrientKeys) {
    const values = scans.flatMap((scan, scanIndex) => {
      const nutrient = scan.nutrients?.[key];
      return hasAmount(nutrient) ? [{ nutrient, scanIndex, weight: (scan.frameQuality ?? 0.65) * nutrient.ocrConfidence * nutrient.parserConfidence }] : [];
    });
    const clusters: Array<typeof values> = [];
    for (const value of values) {
      const cluster = clusters.find((candidate) => matchingAmount(candidate[0].nutrient, value.nutrient));
      if (cluster) cluster.push(value); else clusters.push([value]);
    }
    const winner = clusters.toSorted((left, right) => right.length - left.length || right.reduce((sum, item) => sum + item.weight, 0) - left.reduce((sum, item) => sum + item.weight, 0))[0];
    if (!winner || (winner.length < minimumAgreement && !includeUnstable)) continue;
    const amounts = winner.map((value) => value.nutrient.amount).toSorted((left, right) => left - right);
    const median = amounts[Math.floor(amounts.length / 2)];
    const selected = winner.toSorted((left, right) => Math.abs(left.nutrient.amount - median) - Math.abs(right.nutrient.amount - median) || right.weight - left.weight)[0].nutrient;
    const stable = winner.length >= minimumAgreement;
    nutrients[key] = { ...selected, amount: median, frameCount: winner.length, agreement: Math.round((winner.length / scans.length) * 100), stable, parserConfidence: clamp(selected.parserConfidence * (stable ? 1 : 0.72)) };
  }

  const warnings = (base.warnings ?? []).filter((warning) => !warning.startsWith("Only a few nutrients were recognized."));
  const unstable = Object.values(nutrients).filter((nutrient) => nutrient?.stable === false).length;
  if (Object.keys(nutrients).length < 3) warnings.unshift("Only a few nutrients were recognized. Keep scanning or check every value before saving.");
  if (unstable) warnings.push(`${unstable} value${unstable === 1 ? " is" : "s are"} still being confirmed across live frames.`);
  warnings.push(`Values reconciled across ${scans.length} live camera frame${scans.length === 1 ? "" : "s"}. Review every value before saving.`);
  return { ...base, basis, nutrients, warnings: [...new Set(warnings)], durationMs: scans.reduce((total, scan) => total + scan.durationMs, 0), initializationMs: Math.max(...scans.map((scan) => scan.initializationMs)), frameCount: scans.length, panelConfidence: Math.max(...scans.map((scan) => scan.panelConfidence ?? 0)) };
}
