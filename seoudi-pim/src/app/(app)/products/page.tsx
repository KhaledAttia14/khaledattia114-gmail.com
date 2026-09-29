import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { buildWhere, listSelect, orderBy, parseFilters } from "@/lib/server/product-query";
import { ProductsWorkspace } from "./products-workspace";
import { can } from "@/lib/domain/rbac";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const where = await buildWhere(f, user.id);
  const [rows, total, categories, users, brands, views, profiles, campaigns] = await Promise.all([
    db.product.findMany({ where, select: listSelect, orderBy: orderBy(f), skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    db.product.count({ where }),
    db.category.findMany({ where: { active: true }, select: { id: true, path: true }, orderBy: { path: "asc" } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.savedView.findMany({ where: { OR: [{ isSystem: true }, { shared: true }, { ownerId: user.id }] }, orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.exportProfile.findMany({ where: { active: true, kind: "PRODUCT" }, select: { code: true, name: true } }),
    db.product.findMany({ where: { campaign: { not: null } }, select: { campaign: true }, distinct: ["campaign"] }),
  ]);
  const cols = typeof sp.cols === "string" ? sp.cols.split(",") : null;
  return (
    <ProductsWorkspace
      rows={rows}
      total={total}
      filters={f}
      cols={cols}
      query={new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v.join(",") : v]]))).toString()}
      options={{ categories, users, brands, campaigns: campaigns.map((c) => c.campaign!).filter(Boolean) }}
      views={views.map((v) => ({ id: v.id, name: v.name, query: v.query, isSystem: v.isSystem, mine: v.ownerId === user.id, columns: v.columns }))}
      profiles={profiles}
      perms={{ bulk: can(user.role, "product.bulk"), assign: can(user.role, "product.assign"), create: can(user.role, "product.create"), transition: user.role !== "VIEWER" }}
    />
  );
}
