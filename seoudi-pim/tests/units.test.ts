import { describe, expect, it } from "vitest";
import { deriveWeightKg, formatSize, parseSize, sameQuantity, unitFormatIssues, extractSizesFromText } from "@/lib/domain/units";

describe("parseSize – weight", () => {
  it("500 g -> 0.5 kg", () => {
    const p = parseSize("500 g");
    expect(p.kind).toBe("WEIGHT");
    expect(p.baseTotal).toBe(0.5);
    expect(deriveWeightKg(p)).toBe(0.5);
  });
  it("1 kg -> 1", () => expect(deriveWeightKg("1 kg")).toBe(1));
  it("glued units and Arabic digits", () => {
    expect(deriveWeightKg("500g")).toBe(0.5);
    expect(deriveWeightKg("٥٠٠ جم")).toBe(0.5);
    expect(deriveWeightKg("1 كجم")).toBe(1);
    expect(deriveWeightKg("35.4 جم")).toBe(0.0354);
  });
});

describe("parseSize – volume never becomes weight", () => {
  it("1 L is volume, no weight", () => {
    const p = parseSize("1 L");
    expect(p.kind).toBe("VOLUME");
    expect(p.baseTotal).toBe(1);
    expect(deriveWeightKg(p)).toBeNull();
  });
  it("330 مل is volume", () => {
    expect(parseSize("330 مل").kind).toBe("VOLUME");
    expect(deriveWeightKg("330 ml")).toBeNull();
  });
  it("2.1 Liter capacity", () => {
    expect(parseSize("2.1 Liter").baseTotal).toBe(2.1);
    expect(deriveWeightKg("2.1 Liter")).toBeNull();
  });
});

describe("parseSize – packs and counts", () => {
  it("10 pieces x 250 g", () => {
    const p = parseSize("10 pieces x 250 g");
    expect(p.isPack).toBe(true);
    expect(p.packCount).toBe(10);
    expect(p.value).toBe(250);
    expect(p.total).toBe(2500);
    expect(deriveWeightKg(p)).toBe(2.5);
  });
  it("10 x 250g and 250 g x 10 and Arabic multiplication sign", () => {
    expect(deriveWeightKg("10 x 250g")).toBe(2.5);
    expect(deriveWeightKg("250 g x 10")).toBe(2.5);
    expect(deriveWeightKg("6 × 1 كجم")).toBe(6);
  });
  it("700+700 g", () => {
    const p = parseSize("700+700 g");
    expect(p.parts).toEqual([700, 700]);
    expect(p.packCount).toBe(2);
    expect(deriveWeightKg(p)).toBe(1.4);
  });
  it("700 g + 700 g", () => expect(deriveWeightKg("700 g + 700 g")).toBe(1.4));
  it("5+1 is a count of 6", () => {
    const p = parseSize("5+1");
    expect(p.kind).toBe("COUNT");
    expect(p.total).toBe(6);
    expect(deriveWeightKg(p)).toBeNull();
  });
  it("Pack of 12 / عبوة من 12 / Pack of 5 + 1", () => {
    expect(parseSize("Pack of 12").packCount).toBe(12);
    expect(parseSize("عبوة من 12").packCount).toBe(12);
    expect(parseSize("Pack of 5 + 1").packCount).toBe(6);
    expect(parseSize("عبوة من 5+1").packCount).toBe(6);
    expect(sameQuantity(parseSize("Pack of 12"), parseSize("عبوة من 12"))).toBe(true);
  });
  it("Arabic dual and bare unit", () => {
    expect(parseSize("قطعتين").total).toBe(2);
    expect(parseSize("قطعة").total).toBe(1);
    expect(sameQuantity(parseSize("2 Pieces"), parseSize("قطعتين"))).toBe(true);
  });
  it("counts with nouns", () => {
    expect(parseSize("10 Capsules").kind).toBe("COUNT");
    expect(parseSize("12 لون").total).toBe(12);
  });
  it("ranges and dimensions", () => {
    expect(parseSize("2 - 3 g").isRange).toBe(true);
    expect(deriveWeightKg("2 - 3 g")).toBeNull();
    expect(parseSize("175 × 110 cm").kind).toBe("AREA");
  });
  it("unparseable", () => expect(parseSize("assorted").ok).toBe(false));
});

describe("formatSize", () => {
  it("renders house style", () => {
    expect(formatSize(parseSize("500g"), "en")).toBe("500 g");
    expect(formatSize(parseSize("500g"), "ar")).toBe("500 جم");
    expect(formatSize(parseSize("Pack of 12"), "ar")).toBe("عبوة من 12");
    expect(formatSize(parseSize("1.5 ltr"), "en")).toBe("1.5 Liters");
    expect(formatSize(parseSize("10 x 250 g"), "en")).toBe("10 x 250 g");
  });
});

describe("unit format & extraction", () => {
  it("flags non-standard spellings, glued units and wrong script", () => {
    expect(unitFormatIssues("Chips 150gm", "en").join()).toMatch(/Non-standard unit "gm"/);
    expect(unitFormatIssues("Chips 150g", "en").join()).toMatch(/Missing space/);
    expect(unitFormatIssues("شيبسي 150 g", "ar").join()).toMatch(/Latin unit/);
    expect(unitFormatIssues("Juice 1 لتر", "en").join()).toMatch(/Arabic unit/);
    expect(unitFormatIssues("Bake Rolz Ketchup - 110 g", "en")).toEqual([]);
    expect(unitFormatIssues("بيك رولز - 110 جم", "ar")).toEqual([]);
  });
  it("extracts sizes from titles", () => {
    expect(extractSizesFromText("Bake Rolz Ketchup - 110 g")[0].baseTotal).toBe(0.11);
    expect(extractSizesFromText("M&G Ballpoint Pen - T9")).toHaveLength(0);
  });
});
