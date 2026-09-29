import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { buildExportRow, exportWarnings, type ExportProduct, type ExportProfileDef } from "@/lib/domain/magento";

export const exportSelect = {
  id: true, sku: true, barcode: true, nameEn: true, nameAr: true, descriptionEn: true, descriptionAr: true, shortDescriptionEn: true,
  shortDescriptionAr: true, volumeWeightEn: true, volumeWeightAr: true, weightKg: true, magentoProductType: true, attributeSetCode: true,
  visibility: true, productOnline: true, metaTitleEn: true, metaTitleAr: true, metaDescriptionEn: true, metaDescriptionAr: true, urlKey: true,
  relatedSkus: true, crosssellSkus: true, upsellSkus: true, status: true,
  brand: { select: { name: true } },
  primaryCategory: { select: { path: true } },
  categories: { select: { category: { select: { path: true } } } },
  images: { where: { role: "MAIN" as const }, select: { url: true }, take: 1 },
  attributeValues: { select: { valueText: true, valueNumber: true, valueBool: true, attribute: { select: { magentoCode: true } } } },
} satisfies Prisma.ProductSelect;

type Row = Prisma.ProductGetPayload<{ select: typeof exportSelect }>;

export function toExportProduct(p: Row): ExportProduct {
  const additional: Record<string, string> = {};
  for (const v of p.attributeValues) {
    if (!v.attribute.magentoCode) continue;
    const val = v.valueText ?? (v.valueNumber != null ? String(v.valueNumber) : v.valueBool != null ? (v.valueBool ? "1" : "0") : null);
    if (val) additional[v.attribute.magentoCode] = val;
  }
  return {
    ...p,
    brandName: p.brand?.name,
    categoryPaths: [p.primaryCategory?.path, ...p.categories.map((c) => c.category.path)].filter(Boolean) as string[],
    additional,
    mainImageUrl: p.images[0]?.url ?? null,
  };
}

export async function loadProfile(code: string): Promise<ExportProfileDef | null> {
  const p = await db.exportProfile.findUnique({ where: { code } });
  if (!p) return null;
  return { code: p.code, name: p.name, kind: p.kind as ExportProfileDef["kind"], storeViewCode: p.storeViewCode, locale: p.locale as "en" | "ar",
    columns: p.columns as unknown as ExportProfileDef["columns"], options: (p.options as ExportProfileDef["options"]) ?? undefined };
}

export async function buildExport(profile: ExportProfileDef, where: Prisma.ProductWhereInput) {
  const rows = await db.product.findMany({ where, select: exportSelect, orderBy: { sku: "asc" }, take: 20000 });
  const products = rows.map(toExportProduct);
  return {
    ids: rows.map((r) => r.id),
    headers: profile.columns.map((c) => c.header),
    rows: products.map((p) => buildExportRow(p, profile)),
    warnings: products.flatMap((p) => exportWarnings(p, profile)),
    products,
  };
}
