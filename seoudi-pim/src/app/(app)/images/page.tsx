import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { searchWhere } from "@/lib/server/product-query";
import { PageHeader } from "@/components/pim/page-header";
import { ImageBadge } from "@/components/pim/badges";
import { can } from "@/lib/domain/rbac";
import { IMAGE_STATUSES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ImagesTable } from "./images-table";

export const metadata = { title: "Images" };

export default async function ImagesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.ProductWhereInput = {
    ...(sp.status ? { imageStatus: sp.status as never } : { status: { notIn: ["NEW_IN_RMS", "RMS_QA"] } }),
    ...(sp.q ? searchWhere(sp.q) : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({
      where, orderBy: [{ imageStatus: "asc" }, { priority: "desc" }, { sku: "asc" }], skip: (page - 1) * 50, take: 50,
      select: { id: true, sku: true, nameEn: true, nameAr: true, rmsName: true, status: true, imageStatus: true, priority: true,
        images: { orderBy: [{ role: "asc" }, { sortOrder: "asc" }], select: { id: true, url: true, role: true, status: true, notes: true } } },
    }),
    db.product.count({ where }),
    db.product.groupBy({ by: ["imageStatus"], _count: { _all: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Images" description="Track photography & asset status per SKU. MVP stores image URLs (main + additional)." />
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-5 py-2">
        <Link href="/images" className={cn("rounded border px-2 py-0.5 text-xs", !sp.status && "border-primary bg-accent")}>All in content+</Link>
        {IMAGE_STATUSES.map((s) => (
          <Link key={s} href={`/images?status=${s}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={cn("rounded border px-1 py-0.5", sp.status === s && "border-primary bg-accent")}>
            <ImageBadge status={s} /> <span className="tabular text-[11px]">{counts.find((c) => c.imageStatus === s)?._count._all ?? 0}</span>
          </Link>
        ))}
        <form className="ml-auto" action="/images">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="SKU / title…" className="h-7 w-56 rounded-md border border-input px-2 text-xs" />
        </form>
      </div>
      <ImagesTable rows={rows} canManage={can(user.role, "images.manage")} />
      <div className="flex items-center justify-between border-t bg-card px-5 py-1.5 text-xs text-muted-foreground">
        <span>{total} products</span>
        <span className="flex gap-2">
          {page > 1 && <Link className="text-primary" href={`/images?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>Prev</Link>}
          {page * 50 < total && <Link className="text-primary" href={`/images?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Next</Link>}
        </span>
      </div>
    </div>
  );
}
