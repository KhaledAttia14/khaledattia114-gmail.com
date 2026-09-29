import { describe, expect, it } from "vitest";
import { classifyRecord, crossRowChecks, detectMapping, normalizeRow, parseCategoryCell } from "@/lib/domain/importer";
import { buildExportRow, DEFAULT_EXPORT_PROFILES, expandCategoryPaths, toCsv } from "@/lib/domain/magento";
import { compareField } from "@/lib/domain/compare";

const headers = ["sku", "Rms", "visibility", "name", "localized_name", "store_view_code", "product_type", "attribute_set_code", "weight",
  "volume_or_weight", "volume_or_weight", "related_skus", "crosssell_skus", "upsell_skus", "additional_attributes", "categories",
  "product_online", "meta_title", "meta_title", "url_key"];
const row = [6225000678439.0, "بى ناتشرل عسل فلفل حار 450 جم", "Search", "بى ناتشورال عسل فلفل حار- 450 جم", "B Natural Hot Pepper Honey - 450 g",
  "ar_EG", "simple", "Default", 0.45, "450 جم", "450 g", "5201098000155,5201098000186,", "7.33900140498073e+210", "", "product_brand_id=B Natural",
  "Default Category/Food Cupboard|Default Category/Food Cupboard/Jars & Spreads|Default Category/Food Cupboard/Jars & Spreads/Honey & Molasses",
  1, "B Natural Hot Pepper Honey - 450 g | Seoudi Supermarket", "بى ناتشورال عسل فلفل حار- 450 جم  | سعودي سوبرماركت", "b-natural-hot-pepper-honey-450-g"];

describe("import mapping from the Creation.xlsx layout", () => {
  const mapping = detectMapping(headers);
  it("detects columns incl. duplicates and the Rms column", () => {
    expect(mapping[0]).toBe("sku");
    expect(mapping[1]).toBe("rmsName");
    expect(mapping[3]).toBe("auto:name");
    expect(mapping[9]).toBe("auto:volumeWeight");
    expect(mapping[10]).toBe("auto:volumeWeight");
    expect(mapping[19]).toBe("urlKey");
  });
  it("normalises a row: language by script, SKU float, brand, leaves, corrupted lists", () => {
    const r = normalizeRow(row, mapping, 2);
    expect(r.sku).toBe("6225000678439");
    expect(r.record.nameAr).toMatch(/^بى/);
    expect(r.record.nameEn).toBe("B Natural Hot Pepper Honey - 450 g");
    expect(r.record.volumeWeightEn).toBe("450 g");
    expect(r.record.volumeWeightAr).toBe("450 جم");
    expect(r.record.metaTitleAr).toMatch(/سعودي/);
    expect(r.record.brand).toBe("B Natural");
    expect(r.record.relatedSkus).toEqual(["5201098000155", "5201098000186"]);
    expect(r.record.categories).toEqual(["Food Cupboard/Jars & Spreads/Honey & Molasses"]);
    expect(r.record.productOnline).toBe(true);
    expect(r.errors.join()).toMatch(/crosssellSkus.*scientific/);
  });
  it("fixes the defualt typo and flags bad store views", () => {
    const m = detectMapping(["sku", "store_view_code"]);
    expect(normalizeRow(["1", "defualt"], m, 2).record.storeViewCode).toBe("default");
    expect(normalizeRow(["1", "fr_FR"], m, 2).errors[0]).toMatch(/Unknown store view/);
  });
  it("flags duplicates within the file", () => {
    const m = detectMapping(["sku", "url_key"]);
    const rows = [normalizeRow(["1", "a"], m, 2), normalizeRow(["1", "a"], m, 3)];
    crossRowChecks(rows);
    expect(rows[0].warnings.join()).toMatch(/Duplicate SKU/);
    expect(rows[1].warnings.join()).toMatch(/Duplicate URL key/);
  });
  it("rejects malformed category paths", () => {
    const c = parseCategoryCell("Default Category/Beauty and Personal Care/Oral Care/Default Category/Beauty and Personal Care/Oral Care/Floss");
    expect(c.paths).toEqual([]);
    expect(c.warnings).toHaveLength(1);
  });
});

describe("re-import never blindly overwrites", () => {
  const current = { nameEn: "B Natural Hot Pepper Honey - 450 g", nameAr: null, rmsName: "old rms", weightKg: 0.45 };
  it("creates new SKUs", () => expect(classifyRecord({ sku: "1", nameEn: "x" }, null, null).action).toBe("CREATE"));
  it("fills empty fields, updates RMS-owned fields, and conflicts on edited content", () => {
    const c = classifyRecord({ sku: "1", nameEn: "Different title", nameAr: "عنوان", rmsName: "new rms", weightKg: 0.45 }, current, null);
    const state = Object.fromEntries(c.changes.map((x) => [x.field, x.state]));
    expect(state).toEqual({ nameEn: "CONFLICT", nameAr: "FILL", rmsName: "RMS_UPDATE", weightKg: "SAME" });
    expect(c.action).toBe("CONFLICT");
  });
  it("applies when the PIM value was untouched since the previous import", () => {
    const c = classifyRecord({ sku: "1", nameEn: "Different title" }, current, { nameEn: "B Natural Hot Pepper Honey - 450 g" });
    expect(c.changes[0].state).toBe("APPLY");
    expect(c.action).toBe("UPDATE");
  });
  it("unchanged when identical", () => expect(classifyRecord({ sku: "1", weightKg: 0.45 }, current, null).action).toBe("UNCHANGED"));
  it("explicit overwrite mode", () => expect(classifyRecord({ sku: "1", nameEn: "Other" }, current, null, "OVERWRITE").changes[0].state).toBe("APPLY"));
});

describe("Magento export", () => {
  const product = {
    sku: "6225000678439", brandName: "B Natural", nameEn: "B Natural Hot Pepper Honey - 450 g", nameAr: "بى ناتشورال عسل فلفل حار - 450 جم",
    volumeWeightEn: "450 g", volumeWeightAr: "450 جم", weightKg: 0.45, visibility: "Catalog, Search", productOnline: true,
    urlKey: "b-natural-hot-pepper-honey-450-g", relatedSkus: ["1", "2"], categoryPaths: ["Food Cupboard/Jars & Spreads"],
  };
  it("builds the Arabic store-view row like the workbook", () => {
    const ar = DEFAULT_EXPORT_PROFILES.find((p) => p.code === "MAGENTO_AR_EG")!;
    const r = buildExportRow(product, ar);
    expect(r.name).toBe(product.nameAr);
    expect(r.localized_name).toBe(product.nameEn);
    expect(r.store_view_code).toBe("ar_EG");
    expect(r.volume_or_weight).toBe("450 جم");
    expect(r.meta_title).toBe("بى ناتشورال عسل فلفل حار - 450 جم | سعودي سوبرماركت");
    expect(r.additional_attributes).toBe("product_brand_id=B Natural");
    expect(r.product_online).toBe("1");
  });
  it("expands category ancestors", () => {
    expect(expandCategoryPaths(["Food Cupboard/Jars & Spreads"])).toEqual(["Default Category/Food Cupboard", "Default Category/Food Cupboard/Jars & Spreads"]);
    const cat = DEFAULT_EXPORT_PROFILES.find((p) => p.code === "MAGENTO_CATEGORIES")!;
    expect(buildExportRow(product, cat).categories).toBe("Default Category/Food Cupboard|Default Category/Food Cupboard/Jars & Spreads");
  });
  it("writes CSV with BOM and quoting", () => {
    const csv = toCsv(["a", "b"], [{ a: "x,y", b: 'q"' }]);
    expect(csv.startsWith("﻿a,b")).toBe(true);
    expect(csv).toContain('"x,y","q"""');
  });
});

describe("comparison states", () => {
  it("SAME / CHANGED / MISSING / CONFLICT", () => {
    expect(compareField({ pim: "a", magento: "a" }).state).toBe("SAME");
    expect(compareField({ pim: "a", magento: "b" }).state).toBe("CHANGED");
    expect(compareField({ pim: "a", magento: null }).state).toBe("MISSING");
    expect(compareField({ pim: null, magento: "a" }).state).toBe("MISSING");
    expect(compareField({ rms: "r", pim: "a", magento: "b" }).state).toBe("CONFLICT");
    expect(compareField({ pim: "a", magento: "b", magentoNewer: true }).state).toBe("CONFLICT");
  });
});
