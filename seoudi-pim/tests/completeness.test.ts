import { describe, expect, it } from "vitest";
import { computeCompleteness, DEFAULT_COMPLETENESS_RULES, stageComplete } from "@/lib/domain/completeness";

const base = {
  sku: "1", rmsName: "x", barcode: "1", brandId: "b", primaryCategoryId: "c1", productType: "Honey",
  nameEn: "A", nameAr: "ب", descriptionEn: "d", descriptionAr: "د", volumeWeightEn: "1 L", volumeWeightAr: "1 لتر",
  sizeKind: "VOLUME", images: [] as { role: string; status: string; url?: string | null }[],
};

describe("completeness", () => {
  it("is computed from required fields, not arbitrary weights", () => {
    const r = computeCompleteness(base, DEFAULT_COMPLETENESS_RULES, { upTo: "CONTENT" });
    expect(r.percent).toBe(100);
    expect(r.required).toBe(12);
  });
  it("does not require physical weight for volume items but does for weight items", () => {
    const vol = computeCompleteness(base, DEFAULT_COMPLETENESS_RULES);
    expect(vol.fields.some((f) => f.key === "weightKg")).toBe(false);
    const w = computeCompleteness({ ...base, sizeKind: "WEIGHT" }, DEFAULT_COMPLETENESS_RULES);
    expect(w.missing.some((f) => f.key === "weightKg")).toBe(true);
  });
  it("requires a ready main image at QC stage", () => {
    const r = computeCompleteness(base, DEFAULT_COMPLETENESS_RULES, { upTo: "QC" });
    expect(stageComplete(r, "CONTENT")).toBe(true);
    expect(stageComplete(r, "QC")).toBe(false);
    const ok = computeCompleteness({ ...base, images: [{ role: "MAIN", status: "READY", url: "https://x/y.jpg" }] }, DEFAULT_COMPLETENESS_RULES, { upTo: "QC" });
    expect(stageComplete(ok, "QC")).toBe(true);
  });
  it("adds category and attribute-set requirements", () => {
    const rules = [...DEFAULT_COMPLETENESS_RULES, { stage: "CONTENT" as const, fieldKey: "origin", label: "Origin", categoryId: "food" }];
    const inFood = computeCompleteness(base, rules, { categoryLineage: ["food", "c1"], upTo: "CONTENT" });
    expect(inFood.missing.map((m) => m.key)).toContain("origin");
    const notFood = computeCompleteness(base, rules, { categoryLineage: ["home"], upTo: "CONTENT" });
    expect(notFood.missing.map((m) => m.key)).not.toContain("origin");
    const attrs = computeCompleteness({ ...base, attributes: { flavor: "" } }, DEFAULT_COMPLETENESS_RULES,
      { requiredAttributes: [{ code: "flavor", label: "Flavor" }], upTo: "CONTENT" });
    expect(attrs.percent).toBeLessThan(100);
    expect(attrs.missing[0].label).toBe("Flavor");
  });
});
