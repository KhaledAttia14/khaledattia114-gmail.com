"use server";
import { revalidatePath } from "next/cache";
import type { ImageStatus } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { recompute } from "@/lib/server/products";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });
const STATUSES: ImageStatus[] = ["NOT_REQUESTED", "REQUESTED", "IN_PHOTOGRAPHY", "AVAILABLE", "REJECTED", "MISSING", "READY"];

function validUrl(u: string): boolean {
  if (u.startsWith("/")) return true;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
}

export async function saveImageAction(input: { productId: string; imageId?: string | null; url?: string | null; role: "MAIN" | "ADDITIONAL"; status: ImageStatus; notes?: string | null }): Promise<ActionResult> {
  try {
    const user = await requirePermission("images.manage");
    if (!STATUSES.includes(input.status)) return { ok: false, errors: ["Unknown image status"] };
    const url = input.url?.trim() || null;
    if (url && !validUrl(url)) return { ok: false, errors: ["Image URL must be http(s) or a site-relative path"] };
    if ((input.status === "READY" || input.status === "AVAILABLE") && !url) return { ok: false, errors: [`A URL is required for status ${input.status}`] };
    let id = input.imageId ?? null;
    if (input.role === "MAIN" && !id) {
      const existing = await db.productImage.findFirst({ where: { productId: input.productId, role: "MAIN" } });
      id = existing?.id ?? null;
    }
    const before = id ? await db.productImage.findUnique({ where: { id } }) : null;
    const img = id
      ? await db.productImage.update({ where: { id }, data: { url, status: input.status, notes: input.notes ?? undefined } })
      : await db.productImage.create({ data: { productId: input.productId, url, role: input.role, status: input.status, notes: input.notes ?? null,
          sortOrder: input.role === "MAIN" ? 0 : (await db.productImage.count({ where: { productId: input.productId } })) } });
    await audit(db, { entityType: "ProductImage", entityId: img.id, productId: input.productId, actorId: user.id, action: before ? "UPDATE" : "CREATE",
      field: `image:${img.role.toLowerCase()}`, oldValue: before ? `${before.status} ${before.url ?? ""}` : null, newValue: `${img.status} ${img.url ?? ""}`, reason: input.notes });
    await recompute(input.productId);
    revalidatePath("/images");
    revalidatePath(`/products/${input.productId}`);
    return { ok: true, message: "Image saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Create REQUESTED main-image records for products that have none (or set status on existing main images). */
export async function requestImagesAction(productIds: string[], status: ImageStatus = "REQUESTED"): Promise<ActionResult> {
  try {
    const user = await requirePermission("images.manage");
    let n = 0;
    for (const productId of productIds.slice(0, 500)) {
      const main = await db.productImage.findFirst({ where: { productId, role: "MAIN" } });
      if (main && (main.status === "READY" || main.status === "AVAILABLE") && status === "REQUESTED") continue;
      if (main) await db.productImage.update({ where: { id: main.id }, data: { status } });
      else await db.productImage.create({ data: { productId, role: "MAIN", status } });
      await audit(db, { entityType: "ProductImage", entityId: productId, productId, actorId: user.id, action: "UPDATE", field: "image:main", oldValue: main?.status ?? null, newValue: status, source: "BULK" });
      await recompute(productId);
      n++;
    }
    revalidatePath("/images");
    return { ok: true, message: `${n} product(s) set to ${status}` };
  } catch (e) {
    return fail(e);
  }
}
