/**
 * Configurable automated QC rules. Each rule has a code, a default severity and
 * parameters (config) stored in the QcRule table so admins can tune them.
 */
import { checkLanguage } from "./language";
import { isValidGtin, URL_KEY_RE, normalizeForCompare } from "./text";
import {
  deriveWeightKg, extractSizesFromText, parseSize, sameQuantity, unitFormatIssues, type ParsedSize,
} from "./units";

export type QcOutcome = "PASS" | "WARNING" | "ERROR" | "NEEDS_REVIEW";

export interface QcProductInput {
  sku: string;
  barcode?: string | null;
  rmsName?: string | null;
  brandName?: string | null;
  brandNameAr?: string | null;
  productType?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  volumeWeightEn?: string | null;
  volumeWeightAr?: string | null;
  weightKg?: number | null;
  metaTitleEn?: string | null;
  metaTitleAr?: string | null;
  metaDescriptionEn?: string | null;
  metaDescriptionAr?: string | null;
  urlKey?: string | null;
  model?: string | null;
  color?: string | null;
}

export interface QcDuplicates {
  barcode?: string[];
  nameEn?: string[];
  nameAr?: string[];
  urlKey?: string[];
  similarNameEn?: string[];
}

export interface QcRuleConfig {
  code: string;
  severity: QcOutcome;
  active: boolean;
  config?: Record<string, unknown> | null;
}

export interface QcIssue {
  rule: string;
  field: string;
  outcome: QcOutcome;
  message: string;
}

export interface QcResult {
  outcome: QcOutcome;
  score: number;
  issues: QcIssue[];
  counts: Record<QcOutcome, number>;
}

export interface QcRuleMeta {
  code: string;
  name: string;
  description: string;
  severity: QcOutcome;
  fields: string[];
  config?: Record<string, unknown>;
}

export const QC_RULES: QcRuleMeta[] = [
  { code: "TITLE_STRUCTURE", name: "Title structure", severity: "WARNING", fields: ["nameEn", "nameAr"],
    description: "Title follows 'Brand Type Variant[, Spec] - Size': a ' - ' separator before the size and the brand first.",
    config: { separator: " - " } },
  { code: "TITLE_MAX_LENGTH", name: "Title max length", severity: "WARNING", fields: ["nameEn", "nameAr"],
    description: "Titles must not exceed the configured number of characters.", config: { nameEn: 80, nameAr: 80 } },
  { code: "META_LENGTH", name: "SEO length", severity: "WARNING", fields: ["metaTitleEn", "metaTitleAr", "metaDescriptionEn", "metaDescriptionAr"],
    description: "Meta title / description within SEO length.", config: { metaTitle: 70, metaDescription: 160 } },
  { code: "META_TITLE_FORMAT", name: "Meta title suffix", severity: "WARNING", fields: ["metaTitleEn", "metaTitleAr"],
    description: "Meta titles end with the store suffix.", config: { suffixEn: "| Seoudi Supermarket", suffixAr: "| سعودي سوبرماركت" } },
  { code: "MISSING_BRAND", name: "Missing brand", severity: "ERROR", fields: ["brandId", "nameEn", "nameAr"],
    description: "Brand is assigned and the English title starts with the brand name." },
  { code: "MISSING_TYPE", name: "Missing product type", severity: "WARNING", fields: ["productType", "nameEn"],
    description: "Product type is set and appears in the English title." },
  { code: "MISSING_SIZE", name: "Missing size", severity: "ERROR", fields: ["volumeWeightEn", "volumeWeightAr", "nameEn", "nameAr"],
    description: "Size/pack is set, parseable, and weight/volume sizes appear in both titles." },
  { code: "SIZE_CONSISTENCY", name: "Size consistency", severity: "ERROR", fields: ["volumeWeightEn", "volumeWeightAr", "nameEn", "nameAr"],
    description: "EN size, AR size and the sizes written in the titles describe the same quantity." },
  { code: "WEIGHT_VALIDATION", name: "Physical weight", severity: "ERROR", fields: ["weightKg"],
    description: "Weight-based sizes convert to kg correctly (500 g → 0.5). Volume is never auto-converted to weight.",
    config: { tolerance: 0.001 } },
  { code: "DUPLICATES", name: "Duplicates", severity: "ERROR", fields: ["barcode", "nameEn", "nameAr", "urlKey"],
    description: "No other product shares the barcode, title or URL key; similar titles are flagged for review." },
  { code: "REPEATED_WORDS", name: "Repeated words", severity: "WARNING", fields: ["nameEn", "nameAr"],
    description: "No word is repeated back-to-back." },
  { code: "PUNCTUATION", name: "Punctuation & spacing", severity: "WARNING", fields: ["nameEn", "nameAr", "metaTitleEn", "metaTitleAr"],
    description: "No double spaces, space before comma, missing space after comma, dangling separators or unbalanced brackets." },
  { code: "UNIT_FORMAT", name: "Unit format", severity: "WARNING", fields: ["nameEn", "nameAr", "volumeWeightEn", "volumeWeightAr"],
    description: "Units use the house spelling (g, kg, ml, Liter / جم، كجم، مل، لتر) with a space after the number, in the field's language." },
  { code: "LANGUAGE_MISMATCH", name: "Language mismatch", severity: "ERROR", fields: ["nameEn", "nameAr", "descriptionEn", "descriptionAr", "metaTitleEn", "metaTitleAr", "volumeWeightEn", "volumeWeightAr"],
    description: "No Arabic in English fields; Latin in Arabic fields only for brand names, models, shade numbers and codes." },
  { code: "URL_KEY_FORMAT", name: "URL key format", severity: "WARNING", fields: ["urlKey"],
    description: "URL key is lower-case, hyphen-separated ASCII." },
  { code: "BARCODE_CHECK", name: "Barcode check digit", severity: "NEEDS_REVIEW", fields: ["barcode"],
    description: "EAN/UPC check digit is valid. Internal short codes and in-store (restricted, prefix 2) codes are skipped.",
    config: { skipPrefixes: ["2"] } },
  { code: "RMS_SIZE_MATCH", name: "RMS size match", severity: "NEEDS_REVIEW", fields: ["rmsName", "volumeWeightEn"],
    description: "The size written in the RMS name matches the PIM size." },
];

export const DEFAULT_QC_CONFIG: QcRuleConfig[] = QC_RULES.map((r) => ({
  code: r.code, severity: r.severity, active: true, config: r.config ?? null,
}));

const TEXT_FIELDS_EN = ["nameEn", "descriptionEn", "metaTitleEn", "metaDescriptionEn", "volumeWeightEn"] as const;
const TEXT_FIELDS_AR = ["nameAr", "descriptionAr", "metaTitleAr", "metaDescriptionAr", "volumeWeightAr"] as const;

type RuleFn = (p: QcProductInput, cfg: Record<string, unknown>, dup: QcDuplicates, sev: QcOutcome) => QcIssue[];

const issue = (rule: string, field: string, outcome: QcOutcome, message: string): QcIssue => ({ rule, field, outcome, message });

function startsWithCI(text: string, prefix: string): boolean {
  return normalizeForCompare(text).startsWith(normalizeForCompare(prefix));
}

function measurable(p: ParsedSize): boolean {
  return p.ok && (p.kind === "WEIGHT" || p.kind === "VOLUME") && !p.isRange;
}

const RULES: Record<string, RuleFn> = {
  TITLE_STRUCTURE: (p, cfg, _d, sev) => {
    const out: QcIssue[] = [];
    const sep = (cfg.separator as string) ?? " - ";
    for (const f of ["nameEn", "nameAr"] as const) {
      const t = p[f];
      if (!t) continue;
      const vw = parseSize(f === "nameEn" ? p.volumeWeightEn : p.volumeWeightAr);
      if (measurable(vw) && !t.includes(sep.trim())) {
        out.push(issue("TITLE_STRUCTURE", f, sev, `Title should end with "${sep.trim()} <size>"`));
      } else if (t.includes(sep.trim())) {
        const last = t.split(sep.trim()).pop()!.trim();
        if (!last) out.push(issue("TITLE_STRUCTURE", f, sev, "Nothing after the size separator"));
      }
      if (t.split(/\s+/).length < 2) out.push(issue("TITLE_STRUCTURE", f, sev, "Title is a single word"));
    }
    return out;
  },
  TITLE_MAX_LENGTH: (p, cfg, _d, sev) => {
    const out: QcIssue[] = [];
    for (const f of ["nameEn", "nameAr"] as const) {
      const max = Number(cfg[f] ?? 80);
      const t = p[f];
      if (t && t.length > max) out.push(issue("TITLE_MAX_LENGTH", f, sev, `Title is ${t.length} characters (max ${max})`));
    }
    return out;
  },
  META_LENGTH: (p, cfg, _d, sev) => {
    const out: QcIssue[] = [];
    const mt = Number(cfg.metaTitle ?? 70);
    const md = Number(cfg.metaDescription ?? 160);
    for (const f of ["metaTitleEn", "metaTitleAr"] as const) {
      const t = p[f];
      if (t && t.length > mt) out.push(issue("META_LENGTH", f, sev, `Meta title is ${t.length} characters (max ${mt})`));
    }
    for (const f of ["metaDescriptionEn", "metaDescriptionAr"] as const) {
      const t = p[f];
      if (t && t.length > md) out.push(issue("META_LENGTH", f, sev, `Meta description is ${t.length} characters (max ${md})`));
    }
    return out;
  },
  META_TITLE_FORMAT: (p, cfg, _d, sev) => {
    const out: QcIssue[] = [];
    const en = String(cfg.suffixEn ?? "| Seoudi Supermarket");
    const ar = String(cfg.suffixAr ?? "| سعودي سوبرماركت");
    if (p.metaTitleEn && !p.metaTitleEn.trim().endsWith(en)) out.push(issue("META_TITLE_FORMAT", "metaTitleEn", sev, `Should end with "${en}"`));
    if (p.metaTitleAr && !p.metaTitleAr.trim().endsWith(ar)) out.push(issue("META_TITLE_FORMAT", "metaTitleAr", sev, `Should end with "${ar}"`));
    return out;
  },
  MISSING_BRAND: (p, _c, _d, sev) => {
    if (!p.brandName) return [issue("MISSING_BRAND", "brandId", sev, "Brand is not assigned")];
    const out: QcIssue[] = [];
    if (p.nameEn && !startsWithCI(p.nameEn, p.brandName)) {
      out.push(issue("MISSING_BRAND", "nameEn", "WARNING", `English title should start with the brand "${p.brandName}"`));
    }
    if (p.nameAr && p.brandNameAr && !startsWithCI(p.nameAr, p.brandNameAr)) {
      out.push(issue("MISSING_BRAND", "nameAr", "WARNING", `Arabic title should start with the brand "${p.brandNameAr}"`));
    }
    return out;
  },
  MISSING_TYPE: (p, _c, _d, sev) => {
    if (!p.productType) return [issue("MISSING_TYPE", "productType", sev, "Product type is not set")];
    if (p.nameEn && !normalizeForCompare(p.nameEn).includes(normalizeForCompare(p.productType))) {
      return [issue("MISSING_TYPE", "nameEn", sev, `English title does not mention the product type "${p.productType}"`)];
    }
    return [];
  },
  MISSING_SIZE: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    for (const [f, tf] of [["volumeWeightEn", "nameEn"], ["volumeWeightAr", "nameAr"]] as const) {
      const v = p[f];
      if (!v) { out.push(issue("MISSING_SIZE", f, sev, "Size / pack is empty")); continue; }
      const parsed = parseSize(v);
      if (!parsed.ok) { out.push(issue("MISSING_SIZE", f, "NEEDS_REVIEW", `Size "${v}" cannot be parsed`)); continue; }
      const title = p[tf];
      if (title && measurable(parsed) && extractSizesFromText(title).length === 0) {
        out.push(issue("MISSING_SIZE", tf, sev, `Title does not contain the size (${v})`));
      }
    }
    return out;
  },
  SIZE_CONSISTENCY: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    const en = parseSize(p.volumeWeightEn);
    const ar = parseSize(p.volumeWeightAr);
    if (en.ok && ar.ok && !sameQuantity(en, ar)) {
      out.push(issue("SIZE_CONSISTENCY", "volumeWeightAr", sev, `EN size "${p.volumeWeightEn}" and AR size "${p.volumeWeightAr}" differ`));
    }
    for (const [tf, ref, label] of [["nameEn", en, "EN"], ["nameAr", ar, "AR"]] as const) {
      if (!measurable(ref)) continue;
      const inTitle = extractSizesFromText(p[tf]).filter(measurable);
      if (inTitle.length && !inTitle.some((s) => s.kind === ref.kind && sameTotal(s, ref))) {
        out.push(issue("SIZE_CONSISTENCY", tf, sev, `Size in ${label} title does not match the ${label} size field`));
      }
    }
    return out;
  },
  WEIGHT_VALIDATION: (p, cfg, _d, sev) => {
    const out: QcIssue[] = [];
    const tol = Number(cfg.tolerance ?? 0.001);
    const size = parseSize(p.volumeWeightEn || p.volumeWeightAr);
    const expected = deriveWeightKg(size);
    const w = p.weightKg;
    if (w != null && (Number.isNaN(w) || w < 0)) out.push(issue("WEIGHT_VALIDATION", "weightKg", "ERROR", "Weight must be a positive number (kg)"));
    if (expected != null) {
      if (w == null) out.push(issue("WEIGHT_VALIDATION", "weightKg", "WARNING", `Weight missing – expected ${expected} kg from "${size.input}"`));
      else if (Math.abs(w - expected) > tol) {
        out.push(issue("WEIGHT_VALIDATION", "weightKg", sev, `Weight ${w} kg does not match size "${size.input}" (= ${expected} kg)`));
      }
    } else if (size.ok && size.kind === "VOLUME" && w != null && size.baseTotal != null && Math.abs(w - size.baseTotal) <= tol) {
      out.push(issue("WEIGHT_VALIDATION", "weightKg", "NEEDS_REVIEW",
        `Weight ${w} kg equals the volume (${size.input}) – volume must not be converted to weight automatically; confirm the physical weight`));
    }
    return out;
  },
  DUPLICATES: (_p, _c, d, sev) => {
    const out: QcIssue[] = [];
    if (d.barcode?.length) out.push(issue("DUPLICATES", "barcode", sev, `Barcode also used by ${d.barcode.join(", ")}`));
    if (d.nameEn?.length) out.push(issue("DUPLICATES", "nameEn", sev, `Same English title as ${d.nameEn.join(", ")}`));
    if (d.nameAr?.length) out.push(issue("DUPLICATES", "nameAr", sev, `Same Arabic title as ${d.nameAr.join(", ")}`));
    if (d.urlKey?.length) out.push(issue("DUPLICATES", "urlKey", sev, `URL key already used by ${d.urlKey.join(", ")}`));
    if (d.similarNameEn?.length) out.push(issue("DUPLICATES", "nameEn", "NEEDS_REVIEW", `Very similar title to ${d.similarNameEn.join(", ")}`));
    return out;
  },
  REPEATED_WORDS: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    for (const f of ["nameEn", "nameAr"] as const) {
      const words = (p[f] ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
      for (let i = 1; i < words.length; i++) {
        if (words[i] === words[i - 1] && !/^\d/.test(words[i]) && words[i] !== "-") {
          out.push(issue("REPEATED_WORDS", f, sev, `Repeated word "${words[i]}"`));
          break;
        }
      }
    }
    return out;
  },
  PUNCTUATION: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    for (const f of ["nameEn", "nameAr", "metaTitleEn", "metaTitleAr"] as const) {
      const t = p[f];
      if (!t) continue;
      const probs: string[] = [];
      if (t !== t.trim()) probs.push("leading/trailing spaces");
      if (/ {2,}/.test(t)) probs.push("double spaces");
      if (/\s[,،.]/.test(t)) probs.push("space before comma/period");
      if (/[,،](?=\S)/.test(t.replace(/\d,\d/g, ""))) probs.push("missing space after comma");
      if (/[-–,،:;/]\s*$/.test(t.trim())) probs.push("ends with a separator");
      if (/--|- -|,,|،،/.test(t)) probs.push("repeated separator");
      if (/[^\s-]-\s|\s-[^\s-]/.test(t)) probs.push("hyphen needs a space on both sides");
      const open = (t.match(/\(/g) ?? []).length;
      const close = (t.match(/\)/g) ?? []).length;
      if (open !== close) probs.push("unbalanced brackets");
      if (probs.length) out.push(issue("PUNCTUATION", f, sev, `Punctuation: ${probs.join(", ")}`));
    }
    return out;
  },
  UNIT_FORMAT: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    for (const f of ["nameEn", "volumeWeightEn"] as const) {
      for (const m of unitFormatIssues(p[f], "en")) out.push(issue("UNIT_FORMAT", f, m.startsWith("Arabic") ? "ERROR" : sev, m));
    }
    for (const f of ["nameAr", "volumeWeightAr"] as const) {
      for (const m of unitFormatIssues(p[f], "ar")) out.push(issue("UNIT_FORMAT", f, m.startsWith("Latin") ? "ERROR" : sev, m));
    }
    return out;
  },
  LANGUAGE_MISMATCH: (p, _c, _d, sev) => {
    const out: QcIssue[] = [];
    const allowed = [p.brandName, p.model, p.color].filter(Boolean) as string[];
    for (const f of TEXT_FIELDS_EN) {
      const r = checkLanguage(p[f], "en");
      if (!r.ok) out.push(issue("LANGUAGE_MISMATCH", f, sev, `Arabic text in English field: ${r.fragments.slice(0, 3).join(" ")}`));
    }
    for (const f of TEXT_FIELDS_AR) {
      const r = checkLanguage(p[f], "ar", allowed);
      if (!r.ok) {
        out.push(issue("LANGUAGE_MISMATCH", f, f === "descriptionAr" || f === "metaDescriptionAr" ? "WARNING" : sev,
          `Latin text in Arabic field: ${r.fragments.slice(0, 4).join(", ")}`));
      }
    }
    return out;
  },
  URL_KEY_FORMAT: (p, _c, _d, sev) => {
    if (!p.urlKey) return [];
    return URL_KEY_RE.test(p.urlKey) ? [] : [issue("URL_KEY_FORMAT", "urlKey", sev, "URL key must be lower-case letters, digits and single hyphens")];
  },
  BARCODE_CHECK: (p, cfg, _d, sev) => {
    const code = p.barcode || p.sku;
    if (!code || !/^\d+$/.test(code) || code.length < 8) return []; // internal short codes
    const skip = (cfg.skipPrefixes as string[] | undefined) ?? [];
    if (code.length === 13 && skip.some((pre) => code.startsWith(pre))) return []; // in-store / weighed items
    if (![8, 12, 13, 14].includes(code.length)) return [issue("BARCODE_CHECK", "barcode", sev, `Barcode "${code}" has an unusual length (${code.length})`)];
    return isValidGtin(code) ? [] : [issue("BARCODE_CHECK", "barcode", sev, `Barcode "${code}" has an invalid check digit`)];
  },
  RMS_SIZE_MATCH: (p, _c, _d, sev) => {
    if (!p.rmsName) return [];
    const rmsSizes = extractSizesFromText(p.rmsName).filter(measurable);
    const pim = parseSize(p.volumeWeightEn || p.volumeWeightAr);
    if (!rmsSizes.length || !measurable(pim)) return [];
    if (rmsSizes.some((s) => s.kind === pim.kind && sameTotal(s, pim))) return [];
    return [issue("RMS_SIZE_MATCH", "volumeWeightEn", sev, `RMS name "${p.rmsName}" suggests a different size than "${pim.input}"`)];
  },
};

function sameTotal(a: ParsedSize, b: ParsedSize): boolean {
  if (a.baseTotal == null || b.baseTotal == null) return false;
  // per-item or total may be written in titles ("10 x 250 g" vs "2.5 kg")
  const per = (p: ParsedSize) => (p.value != null && p.baseTotal != null && p.total ? (p.baseTotal / p.total) * p.value : null);
  return Math.abs(a.baseTotal - b.baseTotal) < 1e-9 || (per(a) != null && per(b) != null && Math.abs(per(a)! - per(b)!) < 1e-9);
}

const RANK: Record<QcOutcome, number> = { PASS: 0, WARNING: 1, NEEDS_REVIEW: 2, ERROR: 3 };

export function worst(outcomes: QcOutcome[]): QcOutcome {
  return outcomes.reduce<QcOutcome>((w, o) => (RANK[o] > RANK[w] ? o : w), "PASS");
}

export function runQc(p: QcProductInput, rules: QcRuleConfig[] = DEFAULT_QC_CONFIG, dup: QcDuplicates = {}): QcResult {
  const issues: QcIssue[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    const fn = RULES[r.code];
    if (!fn) continue;
    issues.push(...fn(p, (r.config ?? {}) as Record<string, unknown>, dup, r.severity));
  }
  const counts: Record<QcOutcome, number> = { PASS: 0, WARNING: 0, ERROR: 0, NEEDS_REVIEW: 0 };
  for (const i of issues) counts[i.outcome]++;
  const score = Math.max(0, 100 - counts.ERROR * 20 - counts.NEEDS_REVIEW * 10 - counts.WARNING * 4);
  return { outcome: worst(issues.map((i) => i.outcome)), score, issues, counts };
}

export const QC_OUTCOME_TONE: Record<QcOutcome, "green" | "amber" | "red" | "violet"> = {
  PASS: "green",
  WARNING: "amber",
  ERROR: "red",
  NEEDS_REVIEW: "violet",
};

/** Manual QC checklist shown in the QC queue. */
export const QC_CHECKLIST = [
  { code: "title_en", label: "English title follows the naming convention" },
  { code: "title_ar", label: "Arabic title is a faithful, natural translation" },
  { code: "size", label: "Size / pack matches the physical product and RMS" },
  { code: "brand", label: "Brand and product type are correct" },
  { code: "category", label: "Category is the most specific correct node" },
  { code: "images", label: "Main image matches the SKU (variant, size, colour)" },
  { code: "description", label: "Descriptions are accurate and free of claims" },
  { code: "seo", label: "URL key & meta titles are correct" },
] as const;
