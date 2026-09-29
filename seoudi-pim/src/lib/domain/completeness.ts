/**
 * Completeness = required fields that are filled, where "required" depends on
 * workflow stage (cumulative), attribute set and category (incl. ancestors).
 */

export const STAGES = ["RMS", "CONTENT", "QC", "MAGENTO", "LIVE"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  RMS: "RMS intake",
  CONTENT: "Content",
  QC: "QC",
  MAGENTO: "Magento",
  LIVE: "Live",
};

export interface CompletenessRuleInput {
  stage: Stage;
  fieldKey: string; // core field or "attr:<code>" or "image:main"
  label: string;
  categoryId?: string | null;
  attributeSetId?: string | null;
  active?: boolean;
}

export interface CompletenessProduct {
  [key: string]: unknown;
  sizeKind?: string | null;
  primaryCategoryId?: string | null;
  attributeSetId?: string | null;
  brandId?: string | null;
  images?: { role: string; status: string; url?: string | null }[];
  attributes?: Record<string, unknown>; // by attribute code
}

export interface RequiredField {
  key: string;
  label: string;
  stage: Stage;
  filled: boolean;
}

export interface CompletenessResult {
  percent: number;
  required: number;
  filled: number;
  missing: RequiredField[];
  fields: RequiredField[];
  byStage: Record<Stage, { required: number; filled: number; percent: number; missing: string[] }>;
}

/** Default rules seeded into CompletenessRule; admins can edit them. */
export const DEFAULT_COMPLETENESS_RULES: CompletenessRuleInput[] = [
  { stage: "RMS", fieldKey: "sku", label: "SKU" },
  { stage: "RMS", fieldKey: "rmsName", label: "RMS name" },
  { stage: "RMS", fieldKey: "barcode", label: "Barcode" },
  { stage: "CONTENT", fieldKey: "brandId", label: "Brand" },
  { stage: "CONTENT", fieldKey: "primaryCategoryId", label: "Primary category" },
  { stage: "CONTENT", fieldKey: "productType", label: "Product type" },
  { stage: "CONTENT", fieldKey: "nameEn", label: "English title" },
  { stage: "CONTENT", fieldKey: "nameAr", label: "Arabic title" },
  { stage: "CONTENT", fieldKey: "descriptionEn", label: "English description" },
  { stage: "CONTENT", fieldKey: "descriptionAr", label: "Arabic description" },
  { stage: "CONTENT", fieldKey: "volumeWeightEn", label: "Size / pack (EN)" },
  { stage: "CONTENT", fieldKey: "volumeWeightAr", label: "Size / pack (AR)" },
  { stage: "QC", fieldKey: "image:main", label: "Main image ready" },
  { stage: "MAGENTO", fieldKey: "urlKey", label: "URL key" },
  { stage: "MAGENTO", fieldKey: "metaTitleEn", label: "Meta title (EN)" },
  { stage: "MAGENTO", fieldKey: "metaTitleAr", label: "Meta title (AR)" },
  { stage: "MAGENTO", fieldKey: "visibility", label: "Visibility" },
  { stage: "MAGENTO", fieldKey: "weightKg", label: "Physical weight (kg) – weight-based items" },
  { stage: "LIVE", fieldKey: "metaDescriptionEn", label: "Meta description (EN)" },
  { stage: "LIVE", fieldKey: "metaDescriptionAr", label: "Meta description (AR)" },
];

export function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  return true;
}

function fieldValue(p: CompletenessProduct, key: string): { applicable: boolean; filled: boolean } {
  if (key === "image:main") {
    const ok = (p.images ?? []).some(
      (i) => i.role === "MAIN" && (i.status === "READY" || i.status === "AVAILABLE") && isFilled(i.url),
    );
    return { applicable: true, filled: ok };
  }
  if (key === "weightKg") {
    // only required when the size is a weight – volumes must not be forced into a weight
    if (p.sizeKind !== "WEIGHT") return { applicable: false, filled: true };
    return { applicable: true, filled: isFilled(p.weightKg) };
  }
  if (key.startsWith("attr:")) {
    const code = key.slice(5);
    return { applicable: true, filled: isFilled(p.attributes?.[code]) };
  }
  return { applicable: true, filled: isFilled(p[key]) };
}

export interface CompletenessOptions {
  /** ancestors of the product's primary category, incl. itself */
  categoryLineage?: string[];
  /** attributes required by attribute set and category (added to CONTENT stage) */
  requiredAttributes?: { code: string; label: string }[];
  /** compute up to (and including) this stage; default LIVE */
  upTo?: Stage;
}

export function computeCompleteness(
  p: CompletenessProduct,
  rules: CompletenessRuleInput[],
  opts: CompletenessOptions = {},
): CompletenessResult {
  const lineage = new Set(opts.categoryLineage ?? []);
  const upToIdx = STAGES.indexOf(opts.upTo ?? "LIVE");
  const seen = new Set<string>();
  const fields: RequiredField[] = [];

  const add = (stage: Stage, key: string, label: string) => {
    if (STAGES.indexOf(stage) > upToIdx) return;
    if (seen.has(key)) return;
    const v = fieldValue(p, key);
    if (!v.applicable) return;
    seen.add(key);
    fields.push({ key, label, stage, filled: v.filled });
  };

  for (const r of rules) {
    if (r.active === false) continue;
    if (r.categoryId && !lineage.has(r.categoryId)) continue;
    if (r.attributeSetId && r.attributeSetId !== p.attributeSetId) continue;
    add(r.stage, r.fieldKey, r.label);
  }
  for (const a of opts.requiredAttributes ?? []) add("CONTENT", `attr:${a.code}`, a.label);

  const byStage = Object.fromEntries(
    STAGES.map((s) => {
      const fs = fields.filter((f) => f.stage === s);
      const filled = fs.filter((f) => f.filled).length;
      return [s, {
        required: fs.length, filled,
        percent: fs.length ? Math.round((filled / fs.length) * 100) : 100,
        missing: fs.filter((f) => !f.filled).map((f) => f.label),
      }];
    }),
  ) as CompletenessResult["byStage"];

  const filled = fields.filter((f) => f.filled).length;
  return {
    percent: fields.length ? Math.round((filled / fields.length) * 100) : 100,
    required: fields.length,
    filled,
    missing: fields.filter((f) => !f.filled),
    fields,
    byStage,
  };
}

/** Is every stage up to and including `stage` complete? */
export function stageComplete(r: CompletenessResult, stage: Stage): boolean {
  const idx = STAGES.indexOf(stage);
  return STAGES.slice(0, idx + 1).every((s) => r.byStage[s].filled === r.byStage[s].required);
}

export function missingUpTo(r: CompletenessResult, stage: Stage): string[] {
  const idx = STAGES.indexOf(stage);
  return r.missing.filter((m) => STAGES.indexOf(m.stage) <= idx).map((m) => m.label);
}
