/**
 * Scraped content bakes the scrape account's partner name ("M") or a generic
 * "your partner" into its display fields (`question`, `name`, `title`, …);
 * each such field ships an `invariant*` twin holding a `%{partnerName}`-style
 * placeholder instead. Screens prefer the invariant text and run it through
 * this to show the reader's own partner. Text without placeholders passes
 * through untouched, so it's safe to apply everywhere.
 */
export const personalize = (text: string | null | undefined, partnerName?: string | null): string =>
  // Lowercase fallback: the placeholder sits mid-sentence ("…work with your partner?").
  (text ?? "").replace(/%\{(?:partnerName|yourPartnerName|myPartnerName)\}/g, partnerName || "your partner");
