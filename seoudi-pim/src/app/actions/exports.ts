"use server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { EXPORT_SOURCES, type ExportColumn } from "@/lib/domain/magento";
import type { ActionResult } from "./products";

export async function saveExportProfileAction(input: { id?: string; code: string; name: string; kind: "PRODUCT" | "CATEGORY"; storeViewCode: string | null; locale: "en" | "ar";
  columns: ExportColumn[]; categorySeparator?: string; active: boolean }): Promise<ActionResult> {
  try {
    const user = await requirePermission("settings.manage");
    if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(input.code)) return { ok: false, errors: ["Code: UPPER_CASE letters, digits, underscores"] };
    const cols = input.columns.filter((c) => c.header.trim());
    const bad = cols.filter((c) => !EXPORT_SOURCES.some((s) => s.key === c.source));
    if (!cols.length) return { ok: false, errors: ["Add at least one column"] };
    if (bad.length) return { ok: false, errors: [`Unknown source(s): ${bad.map((b) => b.source).join(", ")}`] };
    const data = { code: input.code, name: input.name || input.code, kind: input.kind, storeViewCode: input.storeViewCode || null, locale: input.locale,
      columns: cols as unknown as Prisma.InputJsonValue, options: { categorySeparator: input.categorySeparator || "|", rootCategory: "Default Category" }, active: input.active };
    const p = input.id ? await db.exportProfile.update({ where: { id: input.id }, data }) : await db.exportProfile.create({ data });
    await audit(db, { entityType: "ExportProfile", entityId: p.id, actorId: user.id, action: input.id ? "UPDATE" : "CREATE", newValue: `${p.code}: ${cols.map((c) => c.header).join(",")}` });
    revalidatePath("/exports");
    return { ok: true, message: "Export profile saved" };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}
