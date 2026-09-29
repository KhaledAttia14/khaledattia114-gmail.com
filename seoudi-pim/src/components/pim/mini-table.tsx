import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { PriorityBadge, QcBadge, StatusBadge } from "@/components/pim/badges";
import { cn, fmtDate, isOverdue, relTime } from "@/lib/utils";

export interface MiniRow {
  id: string;
  sku: string;
  nameEn: string | null;
  rmsName?: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  statusChangedAt?: Date;
  qcOutcome?: string | null;
  qcScore?: number | null;
  owner?: { name: string } | null;
}

export function MiniTable({ title, rows, href, empty = "Nothing here.", showQc = false, showAge = false, linkBase = "/products" }: {
  title: string; rows: MiniRow[]; href?: string; empty?: string; showQc?: boolean; showAge?: boolean; linkBase?: string;
}) {
  return (
    <Card>
      <CardHeader title={<>{title} <span className="tabular ml-1 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{rows.length}</span></>}
        actions={href ? <Link href={href} className="text-[11px] text-primary hover:underline">View all →</Link> : undefined} />
      <Table>
        <THead><tr><TH>SKU</TH><TH>Product</TH><TH>Status</TH>{showQc && <TH>QC</TH>}<TH>Owner</TH><TH>Priority</TH><TH>{showAge ? "In status" : "Due"}</TH></tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={showQc ? 7 : 6}>{empty}</EmptyRow>}
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`${linkBase}/${r.id}`}>{r.sku}</Link></TD>
              <TD className="max-w-[240px] truncate">{r.nameEn ?? <span className="italic text-muted-foreground">{r.rmsName}</span>}</TD>
              <TD><StatusBadge status={r.status} /></TD>
              {showQc && <TD><QcBadge outcome={r.qcOutcome} score={r.qcScore} /></TD>}
              <TD className="whitespace-nowrap">{r.owner?.name ?? <span className="text-muted-foreground">—</span>}</TD>
              <TD><PriorityBadge priority={r.priority} /></TD>
              <TD className={cn("whitespace-nowrap tabular", !showAge && isOverdue(r.dueDate) && "font-medium text-red-600")}>
                {showAge ? relTime(r.statusChangedAt).replace(" ago", "") : r.dueDate ? fmtDate(r.dueDate) : "—"}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

export const miniSelect = {
  id: true, sku: true, nameEn: true, rmsName: true, status: true, priority: true, dueDate: true, statusChangedAt: true, qcOutcome: true, qcScore: true,
  owner: { select: { name: true } },
} as const;
