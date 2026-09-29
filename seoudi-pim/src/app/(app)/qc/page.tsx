import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/pim/page-header";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { CompletenessBar, ImageBadge, PriorityBadge, QcBadge, StatusBadge } from "@/components/pim/badges";
import type { QcIssue } from "@/lib/domain/qc";
import { cn, relTime } from "@/lib/utils";

export const metadata = { title: "QC Queue" };

const TABS: Record<string, { label: string; where: Prisma.ProductWhereInput }> = {
  queue: { label: "Ready / in QC", where: { status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS"] } } },
  mine: { label: "Assigned to me", where: {} },
  final: { label: "Final review", where: { status: "FINAL_REVIEW" } },
  rejected: { label: "Rejected / needs edit", where: { status: { in: ["QC_REJECTED", "NEEDS_EDIT"] } } },
  approved: { label: "Approved", where: { status: "QC_APPROVED" } },
};

export default async function QcQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string; qc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab && sp.tab in TABS ? sp.tab : "queue";
  const where: Prisma.ProductWhereInput = tab === "mine"
    ? { qcReviewerId: user.id, status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS", "FINAL_REVIEW"] } }
    : { ...TABS[tab].where, ...(sp.qc ? { qcOutcome: sp.qc as never } : {}) };
  const [rows, counts] = await Promise.all([
    db.product.findMany({
      where, orderBy: [{ priority: "desc" }, { statusChangedAt: "asc" }], take: 300,
      select: { id: true, sku: true, nameEn: true, nameAr: true, status: true, qcOutcome: true, qcScore: true, qcIssues: true, completeness: true, imageStatus: true,
        priority: true, statusChangedAt: true, owner: { select: { name: true } }, qcReviewer: { select: { name: true } }, _count: { select: { qcFlags: { where: { resolved: false } } } } },
    }),
    Promise.all(Object.entries(TABS).map(async ([k, t]) => [k, await db.product.count({ where: k === "mine" ? { qcReviewerId: user.id, status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS", "FINAL_REVIEW"] } } : t.where })] as const)),
  ]);
  const countMap = Object.fromEntries(counts);
  return (
    <div>
      <PageHeader title="QC Queue" description="Oldest first within priority. Open an item to compare RMS vs created content, flag fields and decide." />
      <div className="flex gap-1 border-b bg-card px-5">
        {Object.entries(TABS).map(([k, t]) => (
          <Link key={k} href={`/qc?tab=${k}`} className={cn("-mb-px border-b-2 px-2.5 py-2 text-[12.5px]", tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label} <span className="tabular ml-1 rounded bg-slate-100 px-1.5 text-[10px]">{countMap[k]}</span>
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs">
          {["ERROR", "NEEDS_REVIEW", "WARNING", "PASS"].map((q) => (
            <Link key={q} href={`/qc?tab=${tab}${sp.qc === q ? "" : `&qc=${q}`}`} className={cn("rounded px-1.5 py-0.5", sp.qc === q ? "bg-accent font-medium" : "text-muted-foreground hover:bg-muted")}>{q}</Link>
          ))}
        </div>
      </div>
      <div className="bg-card">
        <Table>
          <THead><tr><TH>SKU</TH><TH>Product</TH><TH>Status</TH><TH>Auto QC</TH><TH className="text-right">Errors</TH><TH className="text-right">Flags</TH><TH>Complete</TH><TH>Images</TH><TH>Creator</TH><TH>Reviewer</TH><TH>Priority</TH><TH>Waiting</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={13}>Queue is empty.</EmptyRow>}
            {rows.map((r) => {
              const issues = (r.qcIssues as QcIssue[] | null) ?? [];
              const errors = issues.filter((i) => i.outcome === "ERROR").length;
              return (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/qc/${r.id}`}>{r.sku}</Link></TD>
                  <TD className="max-w-[320px]"><div className="truncate font-medium">{r.nameEn ?? "—"}</div><div dir="rtl" className="truncate text-right text-[12px] text-muted-foreground">{r.nameAr ?? "—"}</div></TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD><QcBadge outcome={r.qcOutcome} score={r.qcScore} /></TD>
                  <TD className={cn("tabular text-right", errors ? "font-medium text-red-600" : "text-muted-foreground")}>{errors}</TD>
                  <TD className={cn("tabular text-right", r._count.qcFlags ? "font-medium text-red-600" : "text-muted-foreground")}>{r._count.qcFlags}</TD>
                  <TD><CompletenessBar value={r.completeness} /></TD>
                  <TD><ImageBadge status={r.imageStatus} /></TD>
                  <TD className="whitespace-nowrap">{r.owner?.name ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{r.qcReviewer?.name ?? <span className="text-muted-foreground">—</span>}</TD>
                  <TD><PriorityBadge priority={r.priority} /></TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{relTime(r.statusChangedAt).replace(" ago", "")}</TD>
                  <TD><Link href={`/qc/${r.id}`} className="text-xs text-primary hover:underline">Review →</Link></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
