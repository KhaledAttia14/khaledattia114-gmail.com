/** Configurable Magento export rows (derived from the Creation.xlsx import layouts). */
import { metaTitle } from "./text";

export interface ExportColumn {
  header: string;
  source: string;
}

export interface ExportProfileDef {
  code: string;
  name: string;
  kind: "PRODUCT" | "CATEGORY";
  storeViewCode: string | null;
  locale: "en" | "ar";
  columns: ExportColumn[];
  options?: { categorySeparator?: string; rootCategory?: string; metaSuffixEn?: string; metaSuffixAr?: string };
}

export interface ExportProduct {
  sku: string;
  barcode?: string | null;
  brandName?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  shortDescriptionEn?: string | null;
  shortDescriptionAr?: string | null;
  volumeWeightEn?: string | null;
  volumeWeightAr?: string | null;
  weightKg?: number | null;
  magentoProductType?: string | null;
  attributeSetCode?: string | null;
  visibility?: string | null;
  productOnline?: boolean | null;
  metaTitleEn?: string | null;
  metaTitleAr?: string | null;
  metaDescriptionEn?: string | null;
  metaDescriptionAr?: string | null;
  urlKey?: string | null;
  relatedSkus?: string[];
  crosssellSkus?: string[];
  upsellSkus?: string[];
  categoryPaths?: string[]; // leaf paths without root
  additional?: Record<string, string>; // magentoCode -> value
  status?: string;
  mainImageUrl?: string | null;
}

export const EXPORT_SOURCES: { key: string; label: string }[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Title (profile language)" },
  { key: "localized_name", label: "Title (other language)" },
  { key: "store_view_code", label: "Store view code" },
  { key: "product_type", label: "Magento product type" },
  { key: "attribute_set_code", label: "Attribute set code" },
  { key: "visibility", label: "Visibility" },
  { key: "product_online", label: "Product online (1/2)" },
  { key: "weight", label: "Weight (kg)" },
  { key: "volume_or_weight", label: "Size / pack (profile language)" },
  { key: "related_skus", label: "Related SKUs" },
  { key: "crosssell_skus", label: "Cross-sell SKUs" },
  { key: "upsell_skus", label: "Up-sell SKUs" },
  { key: "additional_attributes", label: "Additional attributes (brand + mapped)" },
  { key: "meta_title", label: "Meta title (profile language)" },
  { key: "meta_description", label: "Meta description (profile language)" },
  { key: "url_key", label: "URL key" },
  { key: "categories", label: "Categories (full paths)" },
  { key: "description", label: "Description (profile language)" },
  { key: "short_description", label: "Short description (profile language)" },
  { key: "base_image", label: "Main image URL" },
  { key: "barcode", label: "Barcode" },
  { key: "brand", label: "Brand" },
  { key: "pim_status", label: "PIM workflow status" },
];

const MAGENTO_COLUMNS = [
  "sku", "visibility", "name", "localized_name", "store_view_code", "product_type", "attribute_set_code", "weight",
  "volume_or_weight", "related_skus", "crosssell_skus", "upsell_skus", "additional_attributes", "product_online", "meta_title", "url_key",
];

export const DEFAULT_EXPORT_PROFILES: ExportProfileDef[] = [
  {
    code: "MAGENTO_DEFAULT_EN", name: "Magento – default store view (English)", kind: "PRODUCT", storeViewCode: "default", locale: "en",
    columns: MAGENTO_COLUMNS.map((c) => ({ header: c, source: c })),
  },
  {
    code: "MAGENTO_AR_EG", name: "Magento – ar_EG store view (Arabic)", kind: "PRODUCT", storeViewCode: "ar_EG", locale: "ar",
    columns: MAGENTO_COLUMNS.map((c) => ({ header: c, source: c })),
  },
  {
    code: "MAGENTO_CATEGORIES", name: "Magento – category assignment", kind: "CATEGORY", storeViewCode: null, locale: "en",
    columns: [{ header: "sku", source: "sku" }, { header: "product_online", source: "product_online" }, { header: "categories", source: "categories" }],
    options: { categorySeparator: "|", rootCategory: "Default Category" },
  },
  {
    code: "MAGENTO_URL_KEYS", name: "Magento – URL key fix", kind: "PRODUCT", storeViewCode: null, locale: "en",
    columns: [{ header: "sku", source: "sku" }, { header: "url_key", source: "url_key" }, { header: "product_online", source: "product_online" }],
  },
  {
    code: "PIM_CONTENT_REVIEW", name: "PIM – bilingual content review", kind: "PRODUCT", storeViewCode: null, locale: "en",
    columns: [
      { header: "sku", source: "sku" }, { header: "barcode", source: "barcode" }, { header: "brand", source: "brand" },
      { header: "name_en", source: "name" }, { header: "name_ar", source: "localized_name" },
      { header: "size_en", source: "volume_or_weight" }, { header: "weight_kg", source: "weight" },
      { header: "categories", source: "categories" }, { header: "url_key", source: "url_key" }, { header: "status", source: "pim_status" },
    ],
  },
];

export function expandCategoryPaths(leaves: string[], root = "Default Category"): string[] {
  const out: string[] = [];
  for (const leaf of leaves) {
    const parts = leaf.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = `${root}/${parts.slice(0, i).join("/")}`;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

export function buildExportRow(p: ExportProduct, profile: ExportProfileDef): Record<string, string> {
  const ar = profile.locale === "ar";
  const o = profile.options ?? {};
  const suffixEn = o.metaSuffixEn ?? "Seoudi Supermarket";
  const suffixAr = o.metaSuffixAr ?? "سعودي سوبرماركت";
  const name = ar ? p.nameAr : p.nameEn;
  const other = ar ? p.nameEn : p.nameAr;
  const value = (source: string): string => {
    switch (source) {
      case "sku": return p.sku;
      case "name": return name ?? "";
      case "localized_name": return other ?? "";
      case "store_view_code": return profile.storeViewCode ?? "";
      case "product_type": return p.magentoProductType ?? "simple";
      case "attribute_set_code": return p.attributeSetCode ?? "Default";
      case "visibility": return p.visibility ?? "Catalog, Search";
      case "product_online": return p.productOnline ? "1" : "2";
      case "weight": return p.weightKg != null ? String(p.weightKg) : "";
      case "volume_or_weight": return (ar ? p.volumeWeightAr : p.volumeWeightEn) ?? "";
      case "related_skus": return (p.relatedSkus ?? []).join(",");
      case "crosssell_skus": return (p.crosssellSkus ?? []).join(",");
      case "upsell_skus": return (p.upsellSkus ?? []).join(",");
      case "additional_attributes": {
        const pairs: string[] = [];
        if (p.brandName) pairs.push(`product_brand_id=${p.brandName}`);
        for (const [k, v] of Object.entries(p.additional ?? {})) if (v) pairs.push(`${k}=${v}`);
        return pairs.join(",");
      }
      case "meta_title":
        return (ar ? p.metaTitleAr : p.metaTitleEn) ?? metaTitle(name, ar ? suffixAr : suffixEn) ?? "";
      case "meta_description": return (ar ? p.metaDescriptionAr : p.metaDescriptionEn) ?? "";
      case "url_key": return p.urlKey ?? "";
      case "categories": return expandCategoryPaths(p.categoryPaths ?? [], o.rootCategory ?? "Default Category").join(o.categorySeparator ?? "|");
      case "description": return (ar ? p.descriptionAr : p.descriptionEn) ?? "";
      case "short_description": return (ar ? p.shortDescriptionAr : p.shortDescriptionEn) ?? "";
      case "base_image": return p.mainImageUrl ?? "";
      case "barcode": return p.barcode ?? "";
      case "brand": return p.brandName ?? "";
      case "pim_status": return p.status ?? "";
      default: return "";
    }
  };
  const row: Record<string, string> = {};
  for (const c of profile.columns) row[c.header] = value(c.source);
  return row;
}

/** Export-time blocking problems (never auto-fix, just warn). */
export function exportWarnings(p: ExportProduct, profile: ExportProfileDef): string[] {
  const w: string[] = [];
  const srcs = profile.columns.map((c) => c.source);
  const ar = profile.locale === "ar";
  if (srcs.includes("name") && !(ar ? p.nameAr : p.nameEn)) w.push(`${p.sku}: missing ${ar ? "Arabic" : "English"} title`);
  if (srcs.includes("url_key") && !p.urlKey) w.push(`${p.sku}: missing url_key`);
  if (srcs.includes("categories") && !(p.categoryPaths ?? []).length) w.push(`${p.sku}: no category`);
  return w;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h] ?? "")).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
