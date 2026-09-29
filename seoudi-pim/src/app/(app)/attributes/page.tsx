import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { PageHeader } from "@/components/pim/page-header";
import { AttributesAdmin } from "./attributes-admin";

export const metadata = { title: "Attributes" };

export default async function AttributesPage() {
  const user = await requireUser();
  const [attrs, sets, catRules, categories, usage] = await Promise.all([
    db.attributeDefinition.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { code: "asc" }] }),
    db.attributeSet.findMany({ include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { products: true, categories: true } } }, orderBy: { code: "asc" } }),
    db.categoryAttribute.findMany({ include: { category: { select: { path: true } }, attribute: { select: { code: true, label: true } } } }),
    db.category.findMany({ where: { active: true }, select: { id: true, path: true }, orderBy: { path: "asc" } }),
    db.productAttributeValue.groupBy({ by: ["attributeId"], _count: { _all: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Attributes & attribute sets" description="Extensible product schema: attribute definitions (typed), attribute sets and category-specific requirements." />
      <AttributesAdmin
        attrs={attrs.map((a) => ({ ...a, options: (a.options as { value: string; label: string }[] | null) ?? [], validation: (a.validation as Record<string, number> | null) ?? {},
          usage: usage.find((u) => u.attributeId === a.id)?._count._all ?? 0 }))}
        sets={sets.map((s) => ({ id: s.id, code: s.code, name: s.name, magentoCode: s.magentoCode, products: s._count.products, categories: s._count.categories,
          items: s.items.map((i) => ({ attributeId: i.attributeId, required: i.required })) }))}
        catRules={catRules.map((r) => ({ categoryId: r.categoryId, path: r.category.path, attributeId: r.attributeId, code: r.attribute.code, label: r.attribute.label, required: r.required }))}
        categories={categories}
        canManage={can(user.role, "attributes.manage")}
      />
    </div>
  );
}
