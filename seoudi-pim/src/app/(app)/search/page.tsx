import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { searchWhere } from "@/lib/server/product-query";
import { PageHeader } from "@/components/pim/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { CompletenessBar, QcBadge, StatusBadge } from "@/components/pim/badges";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  if (!q) redirect("/products");
  const [products, brands, categories] = await Promise.all([
    db.product.findMany({ where: searchWhere(q), take: 100, orderBy: { updatedAt: "desc" },
      select: { id: true, sku: true, nameEn: true, nameAr: true, rmsName: true, status: true, qcOutcome: true, qcScore: true, completeness: true, brand: { select: { name: true } } } }),
    db.brand.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { nameAr: { contains: q } }] }, take: 10, include: { _count: { select: { products: true } } } }),
    db.category.findMany({ where: { OR: [{ path: { contains: q, mode: "insensitive" } }, { nameAr: { contains: q } }] }, take: 10 }),
  ]);
  if (products.length === 1 && (products[0].sku === q || products[0].sku.endsWith(q))) redirect(`/products/${products[0].id}`);
  return (
    <div>
      <PageHeader title={`Search: “${q}”`} description={`${products.length} product(s) · partial match on SKU, barcode, EN/AR title, RMS name, brand and URL key`} />
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_300px]">
        <Card>
          <Table>
            <THead><tr><TH>SKU</TH><TH>Title</TH><TH>Brand</TH><TH>Status</TH><TH>QC</TH><TH>Complete</TH></tr></THead>
            <TBody>
              {products.length === 0 && <EmptyRow colSpan={6}>No products found.</EmptyRow>}
              {products.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/products/${p.id}`}>{p.sku}</Link></TD>
                  <TD className="max-w-[420px]"><div className="truncate">{p.nameEn ?? p.rmsName}</div><div dir="rtl" className="truncate text-right text-[12px] text-muted-foreground">{p.nameAr}</div></TD>
                  <TD>{p.brand?.name ?? "—"}</TD><TD><StatusBadge status={p.status} /></TD><TD><QcBadge outcome={p.qcOutcome} score={p.qcScore} /></TD><TD><CompletenessBar value={p.completeness} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-4">
          <Card><CardHeader title="Brands" />
            <div className="p-2 text-xs">{brands.length === 0 ? <span className="text-muted-foreground">None</span> : brands.map((b) => (
              <Link key={b.id} href={`/products?brand=${b.id}`} className="block rounded px-1 py-0.5 hover:bg-muted">{b.name} <span className="text-muted-foreground">({b._count.products})</span></Link>))}</div>
          </Card>
          <Card><CardHeader title="Categories" />
            <div className="p-2 text-xs">{categories.length === 0 ? <span className="text-muted-foreground">None</span> : categories.map((c) => (
              <Link key={c.id} href={`/products?category=${c.id}`} className="block rounded px-1 py-0.5 hover:bg-muted">{c.path.replace(/\//g, " › ")}</Link>))}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
