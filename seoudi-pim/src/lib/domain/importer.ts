/**
 * Import mapping, row normalisation and safe re-import classification.
 * Pure functions – the DB layer lives in src/lib/server/imports.ts.
 */
import { hasArabic } from "./language";
import { normalizeSku, parseSkuList } from "./text";

export type ImportKind = "RMS" | "CONTENT" | "MAGENTO" | "CATEGORY";

export interface ImportField {
  key: string;
  label: string;
  group: "Identity" | "RMS" | "Content" | "Specs" | "Magento" | "Operations" | "Auto-language";
  aliases: string[];
}

/** "auto:*" targets are resolved per cell by script: Arabic -> AR field, otherwise EN field. */
export const IMPORT_FIELDS: ImportField[] = [
  { key: "sku", label: "SKU", group: "Identity", aliases: ["sku", "item code", "itemcode", "item_code", "كود", "الكود"] },
  { key: "barcode", label: "Barcode", group: "Identity", aliases: ["barcode", "ean", "upc", "gtin", "باركود"] },
  { key: "rmsName", label: "RMS name", group: "RMS", aliases: ["rms", "rms name", "rms_name", "rms description", "item description", "description (rms)", "اسم الصنف"] },
  { key: "rmsBrand", label: "RMS brand", group: "RMS", aliases: ["rms brand", "rms_brand", "supplier brand"] },
  { key: "rmsCategory", label: "RMS category / department", group: "RMS", aliases: ["rms category", "department", "rms_category"] },
  { key: "brand", label: "Brand", group: "Content", aliases: ["brand", "product_brand", "brand name", "الماركة"] },
  { key: "productType", label: "Product type", group: "Content", aliases: ["product type (business)", "type", "product_line_type"] },
  { key: "productLine", label: "Product line", group: "Content", aliases: ["product line", "line", "product_line"] },
  { key: "nameEn", label: "English title", group: "Content", aliases: ["name_en", "english name", "title en", "name (en)"] },
  { key: "nameAr", label: "Arabic title", group: "Content", aliases: ["name_ar", "arabic name", "title ar", "name (ar)", "الاسم"] },
  { key: "auto:name", label: "Title (auto EN/AR by script)", group: "Auto-language", aliases: ["name", "localized_name", "ame", "title", "product name"] },
  { key: "descriptionEn", label: "English description", group: "Content", aliases: ["description_en", "description"] },
  { key: "descriptionAr", label: "Arabic description", group: "Content", aliases: ["description_ar", "الوصف"] },
  { key: "volumeWeightEn", label: "Size / pack (EN)", group: "Specs", aliases: ["volume_or_weight_en", "size_en"] },
  { key: "volumeWeightAr", label: "Size / pack (AR)", group: "Specs", aliases: ["volume_or_weight_ar", "size_ar"] },
  { key: "auto:volumeWeight", label: "Size / pack (auto EN/AR)", group: "Auto-language", aliases: ["volume_or_weight", "size", "volume", "pack size"] },
  { key: "weightKg", label: "Weight (kg)", group: "Specs", aliases: ["weight", "weight_kg", "net weight kg"] },
  { key: "model", label: "Model", group: "Specs", aliases: ["model", "model number"] },
  { key: "color", label: "Color", group: "Specs", aliases: ["color", "colour"] },
  { key: "flavor", label: "Flavor", group: "Specs", aliases: ["flavor", "flavour"] },
  { key: "variant", label: "Variant", group: "Specs", aliases: ["variant"] },
  { key: "origin", label: "Country of origin", group: "Specs", aliases: ["origin", "country of origin", "country_of_manufacture"] },
  { key: "categories", label: "Categories (Magento paths)", group: "Magento", aliases: ["categories", "category", "category path"] },
  { key: "storeViewCode", label: "Store view code", group: "Magento", aliases: ["store_view_code"] },
  { key: "magentoProductType", label: "Magento product type", group: "Magento", aliases: ["product_type"] },
  { key: "attributeSetCode", label: "Attribute set code", group: "Magento", aliases: ["attribute_set_code"] },
  { key: "visibility", label: "Visibility", group: "Magento", aliases: ["visibility"] },
  { key: "productOnline", label: "Product online", group: "Magento", aliases: ["product_online", "status"] },
  { key: "auto:metaTitle", label: "Meta title (auto EN/AR)", group: "Auto-language", aliases: ["meta_title"] },
  { key: "auto:metaDescription", label: "Meta description (auto EN/AR)", group: "Auto-language", aliases: ["meta_description"] },
  { key: "urlKey", label: "URL key", group: "Magento", aliases: ["url_key", "url", "urlkey"] },
  { key: "relatedSkus", label: "Related SKUs", group: "Magento", aliases: ["related_skus"] },
  { key: "crosssellSkus", label: "Cross-sell SKUs", group: "Magento", aliases: ["crosssell_skus"] },
  { key: "upsellSkus", label: "Up-sell SKUs", group: "Magento", aliases: ["upsell_skus"] },
  { key: "additionalAttributes", label: "Additional attributes", group: "Magento", aliases: ["additional_attributes"] },
  { key: "campaign", label: "Campaign", group: "Operations", aliases: ["campaign"] },
  { key: "priority", label: "Priority", group: "Operations", aliases: ["priority"] },
  { key: "imageUrl", label: "Main image URL", group: "Operations", aliases: ["image", "base_image", "image_url", "main image"] },
];

export const RMS_OWNED_FIELDS = ["barcode", "rmsName", "rmsBrand", "rmsCategory"] as const;

export const CONTENT_FIELDS = [
  "brand", "productType", "productLine", "nameEn", "nameAr", "descriptionEn", "descriptionAr", "volumeWeightEn", "volumeWeightAr",
  "weightKg", "model", "color", "flavor", "variant", "origin", "categories", "visibility", "productOnline", "metaTitleEn", "metaTitleAr",
  "metaDescriptionEn", "metaDescriptionAr", "urlKey", "relatedSkus", "crosssellSkus", "upsellSkus", "campaign", "priority", "imageUrl",
  "storeViewCode", "magentoProductType", "attributeSetCode",
] as const;

export type Mapping = Record<number, string>; // column index -> field key ("" = ignore)

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  headers.forEach((h, idx) => {
    const n = normHeader(h ?? "");
    if (!n) { mapping[idx] = ""; return; }
    const field = IMPORT_FIELDS.find((f) => f.key === n || f.aliases.includes(n));
    if (!field) { mapping[idx] = ""; return; }
    // auto-language fields may appear more than once (EN + AR copies)
    if (used.has(field.key) && !field.key.startsWith("auto:")) { mapping[idx] = ""; return; }
    used.add(field.key);
    mapping[idx] = field.key;
  });
  return mapping;
}

export interface ImportRecord {
  sku: string;
  [field: string]: unknown;
}

export interface NormalizedRow {
  rowNumber: number;
  sku: string | null;
  record: Partial<ImportRecord>;
  errors: string[];
  warnings: string[];
}

export interface NormalizeOptions {
  storeViews?: string[];
  visibilities?: string[];
}

const DEFAULT_STORE_VIEWS = ["default", "ar_EG"];
const DEFAULT_VISIBILITY = ["Not Visible Individually", "Catalog", "Search", "Catalog, Search"];

function str(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v && "text" in v) return String((v as { text: unknown }).text).trim() || null; // exceljs rich text
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Magento `categories` cell -> clean paths without "Default Category/" (| separated; commas only between full paths). */
export function parseCategoryCell(v: unknown): { paths: string[]; warnings: string[] } {
  const s = str(v);
  if (!s) return { paths: [], warnings: [] };
  const warnings: string[] = [];
  const chunks = s.split("|").flatMap((c) => c.split(/,(?=Default Category\/)/));
  const paths: string[] = [];
  for (const raw of chunks) {
    let c = raw.trim();
    if (!c) continue;
    if ((c.match(/Default Category/g) ?? []).length > 1) { warnings.push(`Malformed category path "${c.slice(0, 60)}…"`); continue; }
    c = c.replace(/^Default Category\/?/, "");
    const parts = c.split("/").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (raw.includes("/ ") || raw.includes(" /")) warnings.push(`Category path "${c}" had stray spaces (cleaned)`);
    paths.push(parts.join("/"));
  }
  // keep only leaves (drop ancestors that are prefixes of another path)
  const leaves = Array.from(new Set(paths)).filter((p) => !paths.some((q) => q !== p && q.startsWith(p + "/")));
  return { paths: leaves, warnings };
}

export function parseAdditionalAttributes(v: unknown): Record<string, string> {
  const s = str(v);
  if (!s) return {};
  const out: Record<string, string> = {};
  for (const part of s.split(/,(?=[a-z_]+=)/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function normalizeRow(values: unknown[], mapping: Mapping, rowNumber: number, opts: NormalizeOptions = {}): NormalizedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rec: Record<string, unknown> = {};
  const storeViews = opts.storeViews ?? DEFAULT_STORE_VIEWS;
  const visibilities = opts.visibilities ?? DEFAULT_VISIBILITY;

  for (const [idxStr, field] of Object.entries(mapping)) {
    if (!field) continue;
    const raw = values[Number(idxStr)];
    if (field === "sku") { rec.sku = raw; continue; }
    const v = str(raw);
    if (v == null) continue;
    if (field.startsWith("auto:")) {
      const base = field.slice(5);
      const target = `${base}${hasArabic(v) ? "Ar" : "En"}`;
      if (rec[target] != null && rec[target] !== v) warnings.push(`Two different ${target} values in the row – kept the first`);
      else rec[target] = v;
      continue;
    }
    rec[field] = v;
  }

  const skuRes = normalizeSku(rec.sku);
  if (skuRes.error) errors.push(skuRes.error);
  if (skuRes.warning) warnings.push(skuRes.warning);
  rec.sku = skuRes.sku;

  if (rec.barcode) {
    const b = normalizeSku(rec.barcode);
    if (b.error) errors.push(`Barcode: ${b.error}`);
    rec.barcode = b.sku;
  }

  if (rec.weightKg != null) {
    const n = Number(String(rec.weightKg).replace(",", "."));
    if (Number.isNaN(n) || n < 0) errors.push(`Weight "${rec.weightKg}" is not a positive number (kg)`);
    else rec.weightKg = n;
  }

  if (rec.storeViewCode) {
    const sv = String(rec.storeViewCode);
    if (!storeViews.includes(sv)) {
      const fixed = sv.toLowerCase() === "defualt" ? "default" : null;
      if (fixed) { warnings.push(`Store view "${sv}" corrected to "${fixed}"`); rec.storeViewCode = fixed; }
      else errors.push(`Unknown store view "${sv}" (allowed: ${storeViews.join(", ")})`);
    }
  }

  if (rec.visibility && !visibilities.includes(String(rec.visibility))) {
    warnings.push(`Unknown visibility "${rec.visibility}"`);
  }

  if (rec.productOnline != null) {
    const s = String(rec.productOnline).replace(/\.0+$/, "").toLowerCase();
    if (["1", "yes", "true", "enabled", "online"].includes(s)) rec.productOnline = true;
    else if (["2", "0", "no", "false", "disabled", "offline"].includes(s)) rec.productOnline = false;
    else { warnings.push(`product_online "${rec.productOnline}" not understood – ignored`); delete rec.productOnline; }
  }

  for (const f of ["relatedSkus", "crosssellSkus", "upsellSkus"]) {
    if (rec[f] == null) continue;
    const r = parseSkuList(rec[f]);
    if (r.errors.length) { errors.push(...r.errors.map((e) => `${f}: ${e}`)); delete rec[f]; }
    else rec[f] = r.skus;
  }

  if (rec.categories != null) {
    const c = parseCategoryCell(rec.categories);
    warnings.push(...c.warnings);
    rec.categories = c.paths;
  }

  if (rec.additionalAttributes != null) {
    const aa = parseAdditionalAttributes(rec.additionalAttributes);
    if (aa.product_brand_id && !rec.brand) rec.brand = aa.product_brand_id;
  }

  if (rec.priority) {
    const p = String(rec.priority).toUpperCase();
    if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(p)) rec.priority = p;
    else { warnings.push(`Priority "${rec.priority}" not recognised – ignored`); delete rec.priority; }
  }

  // language placement on explicit fields
  if (typeof rec.nameEn === "string" && hasArabic(rec.nameEn)) warnings.push("English title contains Arabic text");
  if (typeof rec.nameAr === "string" && !hasArabic(rec.nameAr)) warnings.push("Arabic title contains no Arabic text");
  if (typeof rec.urlKey === "string" && /[A-Z]/.test(rec.urlKey)) warnings.push(`URL key "${rec.urlKey}" has upper-case letters`);

  return { rowNumber, sku: skuRes.sku, record: rec as Partial<ImportRecord>, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Cross-row checks: duplicate SKUs / barcodes / URL keys inside the file. */
export function crossRowChecks(rows: NormalizedRow[]): void {
  const seen = new Map<string, number[]>();
  const add = (k: string, n: number) => seen.set(k, [...(seen.get(k) ?? []), n]);
  for (const r of rows) {
    if (r.sku) add(`sku:${r.sku}:${r.record.storeViewCode ?? ""}`, r.rowNumber);
    if (r.record.barcode) add(`barcode:${r.record.barcode}`, r.rowNumber);
    if (r.record.urlKey) add(`url:${r.record.urlKey}`, r.rowNumber);
  }
  for (const r of rows) {
    const d = (k: string, label: string) => {
      const rowsWith = seen.get(k) ?? [];
      if (rowsWith.length > 1) r.warnings.push(`Duplicate ${label} in file (rows ${rowsWith.join(", ")})`);
    };
    if (r.sku) d(`sku:${r.sku}:${r.record.storeViewCode ?? ""}`, "SKU");
    if (r.record.barcode && r.record.barcode !== r.sku) d(`barcode:${r.record.barcode}`, "barcode");
    if (r.record.urlKey) d(`url:${r.record.urlKey}`, "URL key");
  }
}

export type ChangeState = "SAME" | "FILL" | "APPLY" | "CONFLICT" | "RMS_UPDATE";

export interface FieldChange {
  field: string;
  current: unknown;
  incoming: unknown;
  state: ChangeState;
}

export interface Classification {
  action: "CREATE" | "UPDATE" | "UNCHANGED" | "CONFLICT";
  changes: FieldChange[];
}

export type OverwriteMode = "FILL_EMPTY" | "OVERWRITE";

function empty(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

function eq(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify([...((a as unknown[]) ?? [])].sort()) === JSON.stringify([...((b as unknown[]) ?? [])].sort());
  }
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/**
 * Decide what a re-import may change. Never blindly overwrite content:
 *  - RMS-owned fields follow RMS (recorded as RMS_UPDATE + snapshot).
 *  - Empty PIM fields are filled.
 *  - A PIM value that still equals the previous import's value (untouched) may be updated.
 *  - Anything the team edited becomes a CONFLICT (unless OVERWRITE mode is explicitly chosen).
 */
export function classifyRecord(
  incoming: Partial<ImportRecord>,
  current: Record<string, unknown> | null,
  previousSnapshot: Record<string, unknown> | null,
  mode: OverwriteMode = "FILL_EMPTY",
): Classification {
  if (!current) {
    return {
      action: "CREATE",
      changes: Object.entries(incoming).filter(([k, v]) => k !== "sku" && !empty(v)).map(([field, v]) => ({ field, current: null, incoming: v, state: "FILL" as const })),
    };
  }
  const changes: FieldChange[] = [];
  for (const [field, value] of Object.entries(incoming)) {
    if (field === "sku" || empty(value)) continue;
    const cur = current[field];
    if (eq(cur, value)) { changes.push({ field, current: cur, incoming: value, state: "SAME" }); continue; }
    if ((RMS_OWNED_FIELDS as readonly string[]).includes(field)) {
      changes.push({ field, current: cur, incoming: value, state: "RMS_UPDATE" });
      continue;
    }
    if (empty(cur)) { changes.push({ field, current: cur, incoming: value, state: "FILL" }); continue; }
    const untouched = previousSnapshot != null && field in previousSnapshot && eq(previousSnapshot[field], cur);
    if (untouched || mode === "OVERWRITE") changes.push({ field, current: cur, incoming: value, state: "APPLY" });
    else changes.push({ field, current: cur, incoming: value, state: "CONFLICT" });
  }
  const hasConflict = changes.some((c) => c.state === "CONFLICT");
  const hasChange = changes.some((c) => c.state !== "SAME" && c.state !== "CONFLICT");
  return { action: hasConflict ? "CONFLICT" : hasChange ? "UPDATE" : "UNCHANGED", changes };
}
