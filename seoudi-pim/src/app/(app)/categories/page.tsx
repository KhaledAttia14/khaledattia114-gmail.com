import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { PageHeader } from "@/components/pim/page-header";
import { TaxonomyManager } from "./taxonomy-manager";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const [cats, counts, sets, history] = await Promise.all([
    db.category.findMany({ orderBy: [{ path: "asc" }], include: { attributeSet: { select: { name: true } }, _count: { select: { attributes: true } } } }),
    db.product.groupBy({ by: ["primaryCategoryId"], _count: { _all: true } }),
    db.attributeSet.findMany({ select: { id: true, name: true } }),
    db.auditLog.findMany({ where: { entityType: "Category" }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.primaryCategoryId ?? "", c._count._all]));
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Categories" description={`Taxonomy tree (${cats.length} nodes, root = Magento "Default Category"). Paths are what exports send to Magento.`} />
      <TaxonomyManager
        nodes={cats.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, parentId: c.parentId, path: c.path, depth: c.depth, active: c.active, magentoId: c.magentoId,
          attributeSetId: c.attributeSetId, attributeSet: c.attributeSet?.name ?? null, sortOrder: c.sortOrder, products: countMap[c.id] ?? 0, requiredAttrs: c._count.attributes }))}
        sets={sets}
        history={history.map((h) => ({ id: h.id, entityId: h.entityId, action: h.action, field: h.field, oldValue: h.oldValue, newValue: h.newValue, reason: h.reason, actor: h.actor?.name ?? "System", createdAt: h.createdAt }))}
        canManage={can(user.role, "taxonomy.manage")}
      />
    </div>
  );
}
