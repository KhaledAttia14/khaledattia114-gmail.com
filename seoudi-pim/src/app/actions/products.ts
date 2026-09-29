"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { requirePermission, requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { recompute, setAttributeValue, transitionProduct, updateProduct } from "@/lib/server/products";
import { can } from "@/lib/domain/rbac";
import { isStatus, type WorkflowStatus } from "@/lib/domain/workflow";
import { metaTitle, normalizeSku, slugify } from "@/lib/domain/text";
import { deriveWeightKg, parseSize, formatSize } from "@/lib/domain/units";

export interface ActionResult {
  ok: boolean;
  message?: string;
  errors?: string[];
}

function fail(e: unknown): ActionResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, errors: [msg] };
}

export async function updateProductAction(productId: string, patch: Record<string, unknown>, reason?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const changed = await updateProduct(productId, patch, user, { reason });
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: changed.length ? `Saved ${changed.length} field(s)` : "No changes" };
  } catch (e) {
    return fail(e);
  }
}

export async function setAttributeAction(productId: string, attributeId: string, locale: string, value: unknown): Promise<ActionResult> {
  try {
    const user = await requirePermission("product.editContent");
    const changed = await setAttributeValue(productId, attributeId, locale, value, user);
    if (changed) await recompute(productId);
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: changed ? "Attribute saved" : "No changes" };
  } catch (e) {
    return fail(e);
  }
}

export async function transitionAction(productId: string, to: string, reason?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isStatus(to)) return { ok: false, errors: ["Unknown status"] };
    const r = await transitionProduct(productId, to as WorkflowStatus, user, reason);
    if (!r.ok) return { ok: false, errors: r.errors };
    revalidatePath(`/products/${productId}`);
    revalidatePath("/qc");
    return { ok: true, message: r.message };
  } catch (e) {
    return fail(e);
  }
}

export async function recomputeAction(productId: string): Promise<ActionResult> {
  try {
    await requireUser();
    const ev = await recompute(productId);
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: `QC ${ev.qc.outcome} (${ev.qc.score}) · ${ev.completeness.percent}% complete` };
  } catch (e) {
    return fail(e);
  }
}

/** Fill empty SEO / Magento fields from the titles. Never overwrites existing values. */
export async function generateDerivedAction(productId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const [sufEn, sufAr] = await Promise.all([
      db.setting.findUnique({ where: { key: "metaSuffixEn" } }), db.setting.findUnique({ where: { key: "metaSuffixAr" } }),
    ]);
    const patch: Record<string, unknown> = {};
    if (!p.urlKey && p.nameEn) patch.urlKey = slugify(p.nameEn);
    if (!p.metaTitleEn && p.nameEn) patch.metaTitleEn = metaTitle(p.nameEn, String(sufEn?.value ?? "Seoudi Supermarket"));
    if (!p.metaTitleAr && p.nameAr) patch.metaTitleAr = metaTitle(p.nameAr, String(sufAr?.value ?? "سعودي سوبرماركت"));
    const size = parseSize(p.volumeWeightEn || p.volumeWeightAr);
    if (!p.volumeWeightAr && p.volumeWeightEn && size.ok) patch.volumeWeightAr = formatSize(size, "ar");
    if (!p.volumeWeightEn && p.volumeWeightAr && size.ok) patch.volumeWeightEn = formatSize(size, "en");
    const w = deriveWeightKg(size);
    if (p.weightKg == null && w != null) patch.weightKg = w;
    const changed = await updateProduct(productId, patch, user, { reason: "Generated from titles / size (empty fields only)" });
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: changed.length ? `Filled: ${changed.join(", ")}` : "Nothing to generate – fields already filled" };
  } catch (e) {
    return fail(e);
  }
}

const createSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional(),
  rmsName: z.string().optional(),
  nameEn: z.string().optional(),
  nameAr: z.string().optional(),
  brandId: z.string().optional(),
  primaryCategoryId: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  campaign: z.string().optional(),
  dueDate: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function createProductAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const user = await requirePermission("product.create");
    const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v).trim() || undefined]));
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    const sku = normalizeSku(parsed.data.sku);
    if (!sku.sku) return { ok: false, errors: [sku.error ?? "Invalid SKU"] };
    const existing = await db.product.findUnique({ where: { sku: sku.sku } });
    if (existing) return { ok: false, errors: [`SKU ${sku.sku} already exists`] };
    if (parsed.data.barcode) {
      const dup = await db.product.findFirst({ where: { barcode: parsed.data.barcode } });
      if (dup) return { ok: false, errors: [`Barcode already used by SKU ${dup.sku}`] };
    }
    const d = parsed.data;
    const p = await db.product.create({
      data: {
        sku: sku.sku, barcode: d.barcode ?? (/^\d{8,14}$/.test(sku.sku) ? sku.sku : null), rmsName: d.rmsName, nameEn: d.nameEn, nameAr: d.nameAr,
        brandId: d.brandId, primaryCategoryId: d.primaryCategoryId, priority: d.priority, campaign: d.campaign,
        dueDate: d.dueDate ? new Date(d.dueDate) : null, ownerId: d.ownerId,
      },
    });
    await audit(db, { entityType: "Product", entityId: p.id, productId: p.id, actorId: user.id, action: "CREATE", source: "UI", reason: "Manual creation" });
    if (d.rmsName) {
      const snap = { sku: p.sku, barcode: p.barcode, rmsName: p.rmsName };
      await db.rmsSnapshot.create({ data: { productId: p.id, data: snap, hash: String(JSON.stringify(snap).length) } });
    }
    await recompute(p.id);
    id = p.id;
    if (sku.warning) console.warn(sku.warning);
  } catch (e) {
    return fail(e);
  }
  redirect(`/products/${id}`);
}

type BulkKind = "assign" | "reviewer" | "status" | "category" | "priority" | "campaign" | "dueDate" | "imageStatus";

export async function bulkAction(ids: string[], kind: BulkKind, value: string, reason?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!ids.length) return { ok: false, errors: ["No products selected"] };
    if (ids.length > 500) return { ok: false, errors: ["Bulk actions are limited to 500 products"] };
    if (kind === "status") {
      if (!isStatus(value)) return { ok: false, errors: ["Unknown status"] };
      const errors: string[] = [];
      let ok = 0;
      for (const id of ids) {
        const r = await transitionProduct(id, value as WorkflowStatus, user, reason, "BULK");
        if (r.ok) ok++;
        else {
          const p = await db.product.findUnique({ where: { id }, select: { sku: true } });
          errors.push(`${p?.sku}: ${r.errors[0]}`);
        }
      }
      revalidatePath("/products");
      return { ok: errors.length === 0, message: `${ok} of ${ids.length} moved`, errors: errors.slice(0, 20) };
    }
    if (!can(user.role, kind === "assign" || kind === "reviewer" || kind === "priority" || kind === "dueDate" || kind === "campaign" ? "product.assign" : "product.bulk")) {
      return { ok: false, errors: ["Your role cannot perform this bulk action"] };
    }
    const field = { assign: "ownerId", reviewer: "qcReviewerId", category: "primaryCategoryId", priority: "priority", campaign: "campaign", dueDate: "dueDate", imageStatus: "imageStatus" }[kind];
    let changed = 0;
    for (const id of ids) {
      const c = await updateProduct(id, { [field]: value || null }, user, { source: "BULK", reason: reason ?? `Bulk ${kind}`, skipPermission: true });
      if (c.length) changed++;
    }
    revalidatePath("/products");
    return { ok: true, message: `Updated ${changed} of ${ids.length} product(s)` };
  } catch (e) {
    return fail(e);
  }
}

export async function addCommentAction(productId: string, body: string, fieldKey?: string | null, parentId?: string | null): Promise<ActionResult> {
  try {
    const user = await requirePermission("comment.create");
    const text = body.trim();
    if (!text) return { ok: false, errors: ["Comment is empty"] };
    const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
    const mentioned = users.filter((u) => text.includes(`@${u.name}`) && u.id !== user.id);
    const c = await db.comment.create({
      data: { productId, body: text.slice(0, 4000), authorId: user.id, fieldKey: fieldKey || null, parentId: parentId || null,
        mentions: { create: mentioned.map((u) => ({ userId: u.id })) } },
    });
    await audit(db, { entityType: "Comment", entityId: c.id, productId, actorId: user.id, action: "COMMENT", field: fieldKey, newValue: text.slice(0, 200) });
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: mentioned.length ? `Comment added · notified ${mentioned.map((m) => m.name).join(", ")}` : "Comment added" };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveCommentAction(commentId: string, resolved = true): Promise<ActionResult> {
  try {
    const user = await requirePermission("comment.resolve");
    const c = await db.comment.update({
      where: { id: commentId },
      data: { resolved, resolvedById: resolved ? user.id : null, resolvedAt: resolved ? new Date() : null },
    });
    await audit(db, { entityType: "Comment", entityId: c.id, productId: c.productId, actorId: user.id, action: resolved ? "RESOLVE" : "REOPEN" });
    revalidatePath(`/products/${c.productId}`);
    return { ok: true, message: resolved ? "Resolved (history kept)" : "Reopened" };
  } catch (e) {
    return fail(e);
  }
}

export async function markMentionsSeenAction(): Promise<ActionResult> {
  const user = await requireUser();
  await db.mention.updateMany({ where: { userId: user.id, seen: false }, data: { seen: true } });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function saveViewAction(name: string, query: string, columns: string[], shared: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!name.trim()) return { ok: false, errors: ["Name the view"] };
    await db.savedView.create({ data: { name: name.trim(), query: query.replace(/^\?/, ""), columns, shared, ownerId: user.id } });
    revalidatePath("/products");
    return { ok: true, message: "View saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteViewAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const v = await db.savedView.findUnique({ where: { id } });
  if (!v || v.isSystem || (v.ownerId !== user.id && user.role !== "ADMIN")) return { ok: false, errors: ["Cannot delete this view"] };
  await db.savedView.delete({ where: { id } });
  revalidatePath("/products");
  return { ok: true, message: "View deleted" };
}

export async function upsertBrandAction(name: string): Promise<ActionResult & { id?: string }> {
  try {
    await requirePermission("product.editContent");
    const n = name.trim();
    if (!n) return { ok: false, errors: ["Brand name required"] };
    const existing = await db.brand.findFirst({ where: { name: { equals: n, mode: "insensitive" } } });
    if (existing) return { ok: true, id: existing.id, message: `Using existing brand "${existing.name}"` };
    const b = await db.brand.create({ data: { name: n } });
    return { ok: true, id: b.id, message: `Brand "${n}" created` };
  } catch (e) {
    return fail(e);
  }
}

export async function setAdditionalCategoriesAction(productId: string, categoryIds: string[]): Promise<ActionResult> {
  try {
    const user = await requirePermission("product.editContent");
    const current = await db.productCategory.findMany({ where: { productId }, include: { category: true } });
    const before = current.map((c) => c.category.path).sort();
    await db.$transaction([
      db.productCategory.deleteMany({ where: { productId } }),
      db.productCategory.createMany({ data: Array.from(new Set(categoryIds)).map((categoryId) => ({ productId, categoryId })) }),
    ]);
    const after = (await db.category.findMany({ where: { id: { in: categoryIds } }, select: { path: true } })).map((c) => c.path).sort();
    await audit(db, { entityType: "Product", entityId: productId, productId, actorId: user.id, action: "UPDATE", field: "categories", oldValue: before, newValue: after });
    revalidatePath(`/products/${productId}`);
    return { ok: true, message: "Additional categories saved" };
  } catch (e) {
    return fail(e);
  }
}
