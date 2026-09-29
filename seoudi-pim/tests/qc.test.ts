import { describe, expect, it } from "vitest";
import { DEFAULT_QC_CONFIG, runQc, type QcProductInput } from "@/lib/domain/qc";

const good: QcProductInput = {
  sku: "6225000678439",
  barcode: "6225000678439",
  rmsName: "بى ناتشرل عسل فلفل حار 450 جم",
  brandName: "B Natural",
  brandNameAr: "بى ناتشورال",
  productType: "Honey",
  nameEn: "B Natural Hot Pepper Honey - 450 g",
  nameAr: "بى ناتشورال عسل فلفل حار - 450 جم",
  volumeWeightEn: "450 g",
  volumeWeightAr: "450 جم",
  weightKg: 0.45,
  metaTitleEn: "B Natural Hot Pepper Honey - 450 g | Seoudi Supermarket",
  metaTitleAr: "بى ناتشورال عسل فلفل حار - 450 جم | سعودي سوبرماركت",
  urlKey: "b-natural-hot-pepper-honey-450-g",
};

const codes = (p: QcProductInput, dup = {}) => runQc(p, DEFAULT_QC_CONFIG, dup).issues.map((i) => `${i.rule}:${i.field}:${i.outcome}`);

describe("QC engine", () => {
  it("passes a clean product", () => {
    const r = runQc(good);
    expect(r.issues).toEqual([]);
    expect(r.outcome).toBe("PASS");
    expect(r.score).toBe(100);
  });
  it("detects missing brand and brand not leading the title", () => {
    expect(codes({ ...good, brandName: null })).toContain("MISSING_BRAND:brandId:ERROR");
    expect(codes({ ...good, nameEn: "Hot Pepper Honey B Natural - 450 g" })).toContain("MISSING_BRAND:nameEn:WARNING");
  });
  it("detects missing type", () => {
    expect(codes({ ...good, productType: null })).toContain("MISSING_TYPE:productType:WARNING");
  });
  it("detects missing size in title and empty size", () => {
    expect(codes({ ...good, nameEn: "B Natural Hot Pepper Honey" })).toContain("MISSING_SIZE:nameEn:ERROR");
    expect(codes({ ...good, volumeWeightAr: "" })).toContain("MISSING_SIZE:volumeWeightAr:ERROR");
  });
  it("detects EN/AR size mismatch and title/size mismatch", () => {
    expect(codes({ ...good, volumeWeightAr: "400 جم" })).toContain("SIZE_CONSISTENCY:volumeWeightAr:ERROR");
    expect(codes({ ...good, nameEn: "B Natural Hot Pepper Honey - 400 g" })).toContain("SIZE_CONSISTENCY:nameEn:ERROR");
  });
  it("validates weight: 500 g -> 0.5 and never volume -> weight", () => {
    expect(codes({ ...good, weightKg: 450 })).toContain("WEIGHT_VALIDATION:weightKg:ERROR");
    const juice: QcProductInput = { ...good, nameEn: "B Natural Juice - 330 ml", nameAr: "بى ناتشورال عصير - 330 مل", productType: "Juice",
      volumeWeightEn: "330 ml", volumeWeightAr: "330 مل", weightKg: 0.33, rmsName: null };
    expect(codes(juice)).toContain("WEIGHT_VALIDATION:weightKg:NEEDS_REVIEW");
    expect(codes({ ...juice, weightKg: null }).filter((c) => c.startsWith("WEIGHT"))).toEqual([]);
  });
  it("detects repeated words and punctuation", () => {
    expect(codes({ ...good, nameEn: "B Natural Hot Hot Pepper Honey - 450 g" })).toContain("REPEATED_WORDS:nameEn:WARNING");
    expect(codes({ ...good, nameEn: "B Natural  Hot Pepper Honey ,450 g -" })).toContain("PUNCTUATION:nameEn:WARNING");
    expect(codes({ ...good, nameAr: "بى ناتشورال عسل فلفل حار- 450 جم" })).toContain("PUNCTUATION:nameAr:WARNING");
  });
  it("detects unit format problems", () => {
    expect(codes({ ...good, nameEn: "B Natural Hot Pepper Honey - 450gm" })).toContain("UNIT_FORMAT:nameEn:WARNING");
    expect(codes({ ...good, volumeWeightAr: "450 g" })).toContain("UNIT_FORMAT:volumeWeightAr:ERROR");
  });
  it("detects language mismatch but allows brand/model tokens", () => {
    expect(codes({ ...good, nameEn: "B Natural عسل - 450 g" })).toContain("LANGUAGE_MISMATCH:nameEn:ERROR");
    expect(codes({ ...good, metaTitleAr: good.metaTitleEn })).toContain("LANGUAGE_MISMATCH:metaTitleAr:ERROR");
    expect(codes({ ...good, nameAr: "بى ناتشورال عسل فلفل حار B Natural - 450 جم" }).some((c) => c.startsWith("LANGUAGE"))).toBe(false);
  });
  it("reports duplicates", () => {
    const r = codes(good, { barcode: ["X1"], urlKey: ["X2"], similarNameEn: ["X3"] });
    expect(r).toContain("DUPLICATES:barcode:ERROR");
    expect(r).toContain("DUPLICATES:urlKey:ERROR");
    expect(r).toContain("DUPLICATES:nameEn:NEEDS_REVIEW");
  });
  it("checks url key, max length, meta suffix, barcode and RMS size", () => {
    expect(codes({ ...good, urlKey: "B-Natural_Honey" })).toContain("URL_KEY_FORMAT:urlKey:WARNING");
    expect(codes({ ...good, nameEn: "B Natural " + "Very ".repeat(20) + "Honey - 450 g" })).toContain("TITLE_MAX_LENGTH:nameEn:WARNING");
    expect(codes({ ...good, metaTitleEn: "B Natural Hot Pepper Honey - 450 g" })).toContain("META_TITLE_FORMAT:metaTitleEn:WARNING");
    expect(codes({ ...good, barcode: "6225000678438" })).toContain("BARCODE_CHECK:barcode:NEEDS_REVIEW");
    expect(codes({ ...good, rmsName: "بى ناتشرل عسل 400 ج" })).toContain("RMS_SIZE_MATCH:volumeWeightEn:NEEDS_REVIEW");
  });
  it("respects configuration: inactive rules and custom severity/params", () => {
    const cfg = DEFAULT_QC_CONFIG.map((r) =>
      r.code === "MISSING_BRAND" ? { ...r, active: false } : r.code === "TITLE_MAX_LENGTH" ? { ...r, severity: "ERROR" as const, config: { nameEn: 10, nameAr: 80 } } : r);
    const r = runQc({ ...good, brandName: null }, cfg);
    expect(r.issues.some((i) => i.rule === "MISSING_BRAND")).toBe(false);
    expect(r.issues.find((i) => i.rule === "TITLE_MAX_LENGTH")?.outcome).toBe("ERROR");
    expect(r.outcome).toBe("ERROR");
  });
  it("aggregates outcome severity", () => {
    expect(runQc({ ...good, urlKey: "Bad Key" }).outcome).toBe("WARNING");
    expect(runQc({ ...good, barcode: "6225000678438" }).outcome).toBe("NEEDS_REVIEW");
  });
});
