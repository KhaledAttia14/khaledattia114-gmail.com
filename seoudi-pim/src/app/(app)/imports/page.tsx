import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { PageHeader } from "@/components/pim/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Imports" };

export default async function ImportsPage() {
  const user = await requireUser();
  const batches = await db.importBatch.findMany({ include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Imports" description="XLSX / CSV import wizard: upload → sheet → map columns → validate & preview → import. Re-imports compare against snapshots and never blindly overwrite content." />
      <div className="grid gap-4 p-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="New import" />
          <div className="p-3">
            {can(user.role, "import.run") ? <UploadForm /> : <p className="text-xs text-muted-foreground">Your role cannot run imports.</p>}
            <div className="mt-4 space-y-1 text-[11px] leading-4 text-muted-foreground">
              <p><b>RMS</b> – new items from RMS (SKU, barcode, RMS name…). RMS-owned fields update; content is never overwritten.</p>
              <p><b>Content</b> – bilingual titles, sizes, descriptions. Fills empty fields; edited fields become conflicts.</p>
              <p><b>Magento</b> – the Creation.xlsx import layout (name/localized_name, store_view_code, volume_or_weight…). Stored as Magento snapshots for comparison.</p>
              <p><b>Category</b> – sku + categories paths.</p>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Import history" />
          <Table>
            <THead><tr><TH>When</TH><TH>File</TH><TH>Sheet</TH><TH>Type</TH><TH>Status</TH><TH className="text-right">Rows</TH><TH className="text-right">New</TH><TH className="text-right">Upd.</TH><TH className="text-right">Err.</TH><TH className="text-right">Warn.</TH><TH>By</TH></tr></THead>
            <TBody>
              {batches.length === 0 && <EmptyRow colSpan={11}>No imports yet.</EmptyRow>}
              {batches.map((b) => (
                <TR key={b.id}>
                  <TD className="whitespace-nowrap">{fmtDate(b.createdAt, true)}</TD>
                  <TD className="max-w-[220px] truncate"><Link className="text-primary hover:underline" href={`/imports/${b.id}`}>{b.fileName}</Link></TD>
                  <TD className="max-w-[140px] truncate">{b.sheetName ?? "—"}</TD>
                  <TD><Badge tone="blue">{b.kind}</Badge></TD>
                  <TD><Badge tone={b.status === "IMPORTED" ? "green" : b.status === "VALIDATED" ? "teal" : "slate"}>{b.status}</Badge></TD>
                  <TD className="tabular text-right">{b.totalRows}</TD><TD className="tabular text-right">{b.createdRows}</TD><TD className="tabular text-right">{b.updatedRows}</TD>
                  <TD className="tabular text-right text-red-600">{b.errorRows || ""}</TD><TD className="tabular text-right text-amber-700">{b.warningRows || ""}</TD>
                  <TD>{b.createdBy.name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
