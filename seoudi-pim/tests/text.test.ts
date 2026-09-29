import { describe, expect, it } from "vitest";
import { isValidGtin, normalizeSku, parseSkuList, similarity, slugify } from "@/lib/domain/text";

describe("text helpers", () => {
  it("slugifies like the Magento url_key convention", () => {
    expect(slugify("Mintra Swimming Towel, 175 × 110 cm - Rose")).toBe("mintra-swimming-towel-175-x-110-cm-rose");
    expect(slugify("Cobz & Co Truffle Flavored Popcorn - 300 g")).toBe("cobz-and-co-truffle-flavored-popcorn-300-g");
    expect(slugify("Hobby Life Container - 2.1 Liter")).toBe("hobby-life-container-2-1-liter");
  });
  it("normalizes SKUs from Excel", () => {
    expect(normalizeSku(6221236068099).sku).toBe("6221236068099");
    expect(normalizeSku("6221236068099.0").sku).toBe("6221236068099");
    expect(normalizeSku("7.33900140498073e+210").error).toMatch(/scientific/);
    expect(normalizeSku("28400032520").warning).toMatch(/leading zero/);
  });
  it("parses SKU lists", () => {
    expect(parseSkuList("111,222,,333,").skus).toEqual(["111", "222", "333"]);
    expect(parseSkuList("7.33900140498073e+210").errors).toHaveLength(1);
  });
  it("validates GTIN check digits", () => {
    expect(isValidGtin("6221236068099")).toBe(true);
    expect(isValidGtin("6221236068098")).toBe(false);
    expect(isValidGtin("028400032520")).toBe(true);
  });
  it("similarity", () => {
    expect(similarity("Mentos Gum - 35 g", "mentos gum 35g")).toBeGreaterThan(0.8);
    expect(similarity("Mentos Gum", "Lipton Tea")).toBeLessThan(0.3);
  });
});
