import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { IMPORT_FIELDS } from "@/lib/domain/importer";
import type { BatchMeta } from "@/lib/server/imports";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import" };

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { filter } = await searchParams;
  const batch = await db.importBatch.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
  if (!batch) notFound();
  const where = filter === "errors" ? { action: "ERROR" } : filter === "warnings" ? { warnings: { isEmpty: false } } : filter ? { action: filter } : {};
  const [rows, samples, actionCounts] = await Promise.all([
    db.importRow.findMany({ where: { batchId: id, ...where }, orderBy: { rowNumber: "asc" }, take: 300 }),
    db.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" }, take: 4, select: { raw: true } }),
    db.importRow.groupBy({ by: ["action"], where: { batchId: id }, _count: { _all: true } }),
  ]);
  const meta = (batch.mapping as BatchMeta | null) ?? {};
  return (
    <ImportWizard
      batch={{ id: batch.id, fileName: batch.fileName, kind: batch.kind, status: batch.status, sheetName: batch.sheetName, headers: batch.headers, totalRows: batch.totalRows,
        createdRows: batch.createdRows, updatedRows: batch.updatedRows, skippedRows: batch.skippedRows, errorRows: batch.errorRows, warningRows: batch.warningRows,
        createdBy: batch.createdBy.name, createdAt: batch.createdAt, completedAt: batch.completedAt }}
      meta={meta}
      samples={samples.map((s) => s.raw as unknown[])}
      rows={rows.map((r) => ({ id: r.id, rowNumber: r.rowNumber, sku: r.sku, action: r.action, errors: r.errors, warnings: r.warnings,
        diff: (r.diff as { field: string; current: unknown; incoming: unknown; state: string }[] | null) ?? [] }))}
      actionCounts={Object.fromEntries(actionCounts.map((a) => [a.action ?? "PENDING", a._count._all]))}
      fields={IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label, group: f.group }))}
      filter={filter ?? ""}
      canRun={can(user.role, "import.run")}
    />
  );
}
