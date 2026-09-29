import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { toCsv } from "@/lib/domain/magento";

interface Change { field: string; current: unknown; incoming: unknown; state: string }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "import.run")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const only = new URL(req.url).searchParams.get("all") === "1" ? undefined : { OR: [{ action: { in: ["ERROR", "CONFLICT"] } }, { warnings: { isEmpty: false } }] };
  const batch = await db.importBatch.findUnique({ where: { id } });
  if (!batch) return new Response("Not found", { status: 404 });
  const rows = await db.importRow.findMany({ where: { batchId: id, ...only }, orderBy: { rowNumber: "asc" } });
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(",") : v == null ? "" : String(v));
  const out = rows.map((r) => {
    const conflicts = ((r.diff as unknown as Change[]) ?? []).filter((c) => c.state === "CONFLICT");
    return {
      row: String(r.rowNumber), sku: r.sku ?? "", action: r.action ?? "", errors: r.errors.join(" | "), warnings: r.warnings.join(" | "),
      conflicts: conflicts.map((c) => `${c.field}: PIM="${fmt(c.current)}" file="${fmt(c.incoming)}"`).join(" | "),
    };
  });
  const csv = toCsv(["row", "sku", "action", "errors", "warnings", "conflicts"], out);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="import_report_${id}.csv"` } });
}
