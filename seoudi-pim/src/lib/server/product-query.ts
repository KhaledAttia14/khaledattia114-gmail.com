import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { WORKFLOW_STATUSES } from "@/lib/domain/workflow";

export interface ProductFilters {
  q?: string;
  status: string[];
  category?: string;
  brand?: string;
  owner?: string; // user id | "me" | "none"
  qc: string[];
  images: string[];
  priority: string[];
  campaign?: string;
  missing: string[];
  overdue?: boolean;
  dateField: "createdAt" | "updatedAt" | "dueDate" | "statusChangedAt";
  from?: string;
  to?: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

type SP = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

export const SORTABLE = ["sku", "nameEn", "status", "updatedAt", "createdAt", "dueDate", "completeness", "qcScore", "priority", "statusChangedAt"];

export function parseFilters(sp: SP): ProductFilters {
  const dateField = one(sp.dateField);
  const sort = one(sp.sort) ?? "updatedAt";
  return {
    q: one(sp.q)?.trim(),
    status: list(sp.status).filter((s) => (WORKFLOW_STATUSES as readonly string[]).includes(s)),
    category: one(sp.category),
    brand: one(sp.brand),
    owner: one(sp.owner),
    qc: list(sp.qc),
    images: list(sp.images),
    priority: list(sp.priority),
    campaign: one(sp.campaign),
    missing: list(sp.missing),
    overdue: one(sp.overdue) === "1",
    dateField: (["createdAt", "updatedAt", "dueDate", "statusChangedAt"].includes(dateField ?? "") ? dateField : "createdAt") as ProductFilters["dateField"],
    from: one(sp.from),
    to: one(sp.to),
    sort: SORTABLE.includes(sort) ? sort : "updatedAt",
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    pageSize: Math.min(200, Math.max(10, Number(one(sp.pageSize) ?? 50) || 50)),
  };
}

/** Partial-match search on SKU, barcode, EN/AR title, RMS name and brand. */
export function searchWhere(q: string): Prisma.ProductWhereInput {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
  return {
    AND: terms.map((t) => ({
      OR: [
        { sku: { contains: t, mode: "insensitive" } },
        { barcode: { contains: t } },
        { nameEn: { contains: t, mode: "insensitive" } },
        { nameAr: { contains: t } },
        { rmsName: { contains: t } },
        { brand: { name: { contains: t, mode: "insensitive" } } },
        { urlKey: { contains: t.toLowerCase() } },
      ],
    })),
  };
}

export async function buildWhere(f: ProductFilters, userId: string): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [];
  if (f.q) and.push(searchWhere(f.q));
  if (f.status.length) and.push({ status: { in: f.status as never } });
  if (f.category) {
    if (f.category === "none") and.push({ primaryCategoryId: null });
    else {
      const cat = await db.category.findUnique({ where: { id: f.category }, select: { path: true } });
      if (cat) {
        and.push({
          OR: [
            { primaryCategory: { path: { startsWith: cat.path } } },
            { categories: { some: { category: { path: { startsWith: cat.path } } } } },
          ],
        });
      }
    }
  }
  if (f.brand) and.push(f.brand === "none" ? { brandId: null } : { brandId: f.brand });
  if (f.owner) and.push(f.owner === "none" ? { ownerId: null } : { ownerId: f.owner === "me" ? userId : f.owner });
  if (f.qc.length) {
    const noQc = f.qc.includes("NONE");
    const vals = f.qc.filter((q) => q !== "NONE");
    and.push({ OR: [...(vals.length ? [{ qcOutcome: { in: vals as never } }] : []), ...(noQc ? [{ qcOutcome: null }] : [])] });
  }
  if (f.images.length) and.push({ imageStatus: { in: f.images as never } });
  if (f.priority.length) and.push({ priority: { in: f.priority as never } });
  if (f.campaign) and.push(f.campaign === "none" ? { campaign: null } : { campaign: f.campaign });
  for (const m of f.missing) and.push({ missingFields: { has: m } });
  if (f.overdue) and.push({ dueDate: { lt: new Date() }, status: { notIn: ["LIVE", "FINAL_REVIEW", "COMPLETED"] } });
  if (f.from || f.to) {
    const range: Prisma.DateTimeFilter = {};
    if (f.from) range.gte = new Date(f.from);
    if (f.to) range.lte = new Date(`${f.to}T23:59:59`);
    and.push({ [f.dateField]: range });
  }
  return and.length ? { AND: and } : {};
}

export function orderBy(f: ProductFilters): Prisma.ProductOrderByWithRelationInput[] {
  const o: Prisma.ProductOrderByWithRelationInput =
    f.sort === "dueDate" || f.sort === "qcScore" || f.sort === "nameEn"
      ? { [f.sort]: { sort: f.dir, nulls: "last" } }
      : { [f.sort]: f.dir };
  return [o, { sku: "asc" }];
}

export const listSelect = {
  id: true, sku: true, barcode: true, nameEn: true, nameAr: true, rmsName: true, status: true, imageStatus: true, qcOutcome: true, qcScore: true,
  completeness: true, missingFields: true, priority: true, campaign: true, dueDate: true, updatedAt: true, createdAt: true, statusChangedAt: true,
  volumeWeightEn: true, weightKg: true, urlKey: true, productOnline: true,
  brand: { select: { id: true, name: true } },
  primaryCategory: { select: { id: true, name: true, path: true } },
  owner: { select: { id: true, name: true } },
  images: { where: { role: "MAIN" as const }, select: { url: true, status: true }, take: 1 },
} satisfies Prisma.ProductSelect;

export type ProductListRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;
