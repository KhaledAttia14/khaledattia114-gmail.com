import { requirePagePermission } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/pim/page-header";
import { NewProductForm } from "./new-product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePagePermission("product.create");
  const [brands, categories, users] = await Promise.all([
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { active: true }, select: { id: true, path: true }, orderBy: { path: "asc" } }),
    db.user.findMany({ where: { active: true, role: { not: "VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="New product" description="Manual intake for a single SKU. For batches use Imports. The product starts in New in RMS." />
      <div className="max-w-3xl p-5"><NewProductForm brands={brands} categories={categories} users={users} /></div>
    </div>
  );
}
