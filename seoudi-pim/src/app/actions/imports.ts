"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { optionsFor, readFileRows, runImport, selectSheet, storeUpload, validateBatch, type BatchMeta, type ImportOptions } from "@/lib/server/imports";
import type { ImportKind, Mapping } from "@/lib/domain/importer";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });
const KINDS: ImportKind[] = ["RMS", "CONTENT", "MAGENTO", "CATEGORY"];

export async function uploadImportAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const user = await requirePermission("import.run");
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "RMS") as ImportKind;
    if (!(file instanceof File) || file.size === 0) return { ok: false, errors: ["Choose an .xlsx or .csv file"] };
    if (!KINDS.includes(kind)) return { ok: false, errors: ["Unknown import type"] };
    const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
    if (!ext) return { ok: false, errors: ["Only .xlsx and .csv files are supported"] };
    if (file.size > 20 * 1024 * 1024) return { ok: false, errors: ["File is larger than 20 MB"] };
    const buf = Buffer.from(await file.arrayBuffer());
    const { sheets } = await readFileRows(buf, ext, "__list_only__");
    const batch = await db.importBatch.create({
      data: { fileName: file.name.slice(0, 200), kind, createdById: user.id, status: "UPLOADED",
        mapping: { sheets, ext, options: optionsFor(kind) } as unknown as Prisma.InputJsonValue },
    });
    await storeUpload(batch.id, ext, buf);
    await audit(db, { entityType: "ImportBatch", entityId: batch.id, actorId: user.id, action: "UPLOAD", source: "IMPORT", newValue: `${file.name} (${kind})` });
    // single sheet / csv: go straight to mapping
    if (sheets.length === 1) await selectSheet(batch.id, sheets[0].name);
    id = batch.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/imports/${id}`);
}

export async function selectSheetAction(batchId: string, sheet: string): Promise<ActionResult> {
  try {
    await requirePermission("import.run");
    await selectSheet(batchId, sheet);
    revalidatePath(`/imports/${batchId}`);
    return { ok: true, message: `Loaded sheet "${sheet}"` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveMappingAction(batchId: string, columns: Mapping, options: ImportOptions): Promise<ActionResult> {
  try {
    await requirePermission("import.run");
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.status === "IMPORTED") return { ok: false, errors: ["Batch already imported"] };
    const meta = (batch.mapping as BatchMeta | null) ?? {};
    await db.importBatch.update({ where: { id: batchId }, data: { status: "MAPPED", mapping: { ...meta, columns, options } as unknown as Prisma.InputJsonValue } });
    const counts = await validateBatch(batchId);
    revalidatePath(`/imports/${batchId}`);
    return { ok: counts.errors === 0, message: `Validated: ${counts.created} new, ${counts.updated} to update, ${counts.skipped} unchanged, ${counts.errors} with errors, ${counts.warnings} with warnings` };
  } catch (e) {
    return fail(e);
  }
}

export async function runImportAction(batchId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("import.run");
    const r = await runImport(batchId, user);
    revalidatePath(`/imports/${batchId}`);
    revalidatePath("/products");
    return { ok: true, message: `Imported: ${r.created} created, ${r.updated} updated. ${r.conflicts} row(s) had conflicting fields that were NOT overwritten (see report).` };
  } catch (e) {
    return fail(e);
  }
}
