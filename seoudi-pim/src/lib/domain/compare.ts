/** RMS vs PIM vs Magento comparison. */

export type CompareState = "SAME" | "CHANGED" | "MISSING" | "CONFLICT";

export interface CompareInput {
  rms?: unknown;
  pim?: unknown;
  magento?: unknown;
  /** true when the Magento value was captured after the PIM value last changed */
  magentoNewer?: boolean;
}

export interface CompareOutput {
  state: CompareState;
  note: string;
}

function norm(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return [...v].map(String).sort().join(",");
  if (typeof v === "boolean") return v ? "1" : "2";
  return String(v).trim().replace(/\s+/g, " ");
}

export function compareField({ rms, pim, magento, magentoNewer }: CompareInput, hasMagentoData = true): CompareOutput {
  const r = norm(rms);
  const p = norm(pim);
  const m = norm(magento);
  if (!p && !m) return { state: "MISSING", note: "Empty in PIM and Magento" };
  if (!p) return { state: "MISSING", note: "Missing in PIM" };
  if (hasMagentoData && !m) return { state: "MISSING", note: "Not in Magento yet" };
  if (r && m && r !== p && p !== m && r !== m) return { state: "CONFLICT", note: "RMS, PIM and Magento all differ" };
  if (hasMagentoData && p !== m) {
    if (magentoNewer) return { state: "CONFLICT", note: "Edited in Magento after the last PIM change" };
    return { state: "CHANGED", note: "PIM differs from Magento – needs export" };
  }
  if (r && r !== p) return { state: "CHANGED", note: "PIM content differs from RMS (expected for enriched fields)" };
  return { state: "SAME", note: "" };
}

/** Field mapping used by the comparison view. Magento snapshots are stored with PIM field keys. */
export const COMPARE_FIELDS: { key: string; label: string; rmsKey?: string }[] = [
  { key: "nameEn", label: "English title" },
  { key: "nameAr", label: "Arabic title" },
  { key: "volumeWeightEn", label: "Size (EN)" },
  { key: "volumeWeightAr", label: "Size (AR)" },
  { key: "weightKg", label: "Weight (kg)" },
  { key: "brand", label: "Brand", rmsKey: "rmsBrand" },
  { key: "urlKey", label: "URL key" },
  { key: "visibility", label: "Visibility" },
  { key: "productOnline", label: "Online" },
  { key: "categories", label: "Categories" },
  { key: "metaTitleEn", label: "Meta title (EN)" },
  { key: "metaTitleAr", label: "Meta title (AR)" },
];
