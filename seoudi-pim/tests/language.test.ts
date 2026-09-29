import { describe, expect, it } from "vitest";
import { checkLanguage } from "@/lib/domain/language";

describe("language placement", () => {
  it("rejects Arabic in English fields", () => {
    expect(checkLanguage("Mentos Gum - 35 جم", "en").ok).toBe(false);
    expect(checkLanguage("Mentos Gum - 35 g", "en").ok).toBe(true);
  });
  it("allows brand names, models, shade numbers and codes in Arabic fields", () => {
    expect(checkLanguage("ام اند جي قلم جاف، 4 الوان - T9", "ar").ok).toBe(true);
    expect(checkLanguage("مينترا كرسي بلاستيك - 7132", "ar").ok).toBe(true);
    expect(checkLanguage("احمر شفاه درجة #05", "ar").ok).toBe(true);
    expect(checkLanguage("لوك اند لوك علبة Lock and Lock", "ar", ["Lock and Lock"]).ok).toBe(true);
    expect(checkLanguage("سماعة USB LED", "ar").ok).toBe(true);
  });
  it("flags English words inside Arabic text", () => {
    const r = checkLanguage("عسل Honey طبيعي", "ar");
    expect(r.ok).toBe(false);
    expect(r.fragments).toContain("Honey");
  });
  it("flags a fully English value in an Arabic field", () => {
    expect(checkLanguage("B Natural Hot Pepper Honey - 450 g", "ar").ok).toBe(false);
  });
});
