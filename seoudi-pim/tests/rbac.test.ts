import { describe, expect, it } from "vitest";
import { can, canEditField, PERMISSIONS, ROLES } from "@/lib/domain/rbac";

describe("RBAC", () => {
  it("is role based only", () => {
    for (const roles of Object.values(PERMISSIONS)) for (const r of roles) expect(ROLES).toContain(r);
  });
  it("viewers are read-only", () => {
    expect(can("VIEWER", "product.view")).toBe(true);
    const writes = (Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).filter((p) => p !== "product.view");
    for (const p of writes) expect(can("VIEWER", p)).toBe(false);
  });
  it("separates content, QC and Magento responsibilities", () => {
    expect(can("CONTENT_CREATOR", "product.editContent")).toBe(true);
    expect(can("CONTENT_CREATOR", "qc.review")).toBe(false);
    expect(can("CONTENT_QUALITY", "qc.review")).toBe(true);
    expect(canEditField("CONTENT_CREATOR", "nameAr")).toBe(true);
    expect(canEditField("CONTENT_CREATOR", "visibility")).toBe(false);
    expect(canEditField("CONTENT_CREATOR", "rmsName")).toBe(false);
    expect(canEditField("ECOMMERCE_SPECIALIST", "productOnline")).toBe(true);
    expect(can("ECOMMERCE_SPECIALIST", "users.manage")).toBe(false);
    expect(can("ADMIN", "users.manage")).toBe(true);
    expect(can(null, "product.view")).toBe(false);
  });
});
