import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { buildWhere, parseFilters } from "@/lib/server/product-query";
import { buildExport, loadProfile } from "@/lib/server/exports";
import { can } from "@/lib/domain/rbac";
import { toCsv } from "@/lib/domain/magento";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "export.run")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const profile = await loadProfile(sp.profile ?? "");
  if (!profile) return new Response("Unknown export profile", { status: 400 });
  const ids = sp.ids ? sp.ids.split(",").filter(Boolean) : null;
  const where = ids ? { id: { in: ids } } : await buildWhere(parseFilters(sp), user.id);
  const out = await buildExport(profile, where);
  const record = sp.record === "1" && can(user.role, "product.editMagento");
  if (record && profile.kind === "PRODUCT" && profile.storeViewCode) {
    // remember what was sent to Magento for later comparison
    await db.magentoSnapshot.createMany({
      data: out.products.map((p, i) => ({
        productId: out.ids[i], storeViewCode: profile.storeViewCode!, source: "export",
        data: profile.locale === "ar"
          ? { nameAr: p.nameAr, volumeWeightAr: p.volumeWeightAr, metaTitleAr: out.rows[i].meta_title ?? p.metaTitleAr }
          : { nameEn: p.nameEn, volumeWeightEn: p.volumeWeightEn, weightKg: p.weightKg, urlKey: p.urlKey, visibility: p.visibility,
              productOnline: p.productOnline, metaTitleEn: out.rows[i].meta_title ?? p.metaTitleEn, brand: p.brandName, categories: p.categoryPaths },
      })),
    });
  }
  await audit(db, { entityType: "Export", entityId: profile.code, actorId: user.id, action: "EXPORT", source: "EXPORT",
    newValue: `${out.rows.length} rows${record ? " (recorded as Magento snapshot)" : ""}`, reason: out.warnings.length ? `${out.warnings.length} warnings` : null });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new Response(toCsv(out.headers, out.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${profile.code.toLowerCase()}_${stamp}.csv"`,
      "x-export-warnings": String(out.warnings.length),
    },
  });
}
