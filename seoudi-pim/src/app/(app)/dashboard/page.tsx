import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ownerWorkload, qcRuleBreakdown, statusAging, statusCounts, OPEN_WHERE } from "@/lib/server/stats";
import { PageHeader, Stat } from "@/components/pim/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { ImageBadge, StatusBadge, PriorityBadge } from "@/components/pim/badges";
import { MAIN_PATH, EXCEPTION_STATUSES, STATUS_LABELS } from "@/lib/domain/workflow";
import { QC_RULES } from "@/lib/domain/qc";
import { IMAGE_STATUSES } from "@/lib/labels";
import { fieldLabel } from "@/lib/labels";
import { fmtDate, relTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function Bar({ value, max, className = "bg-primary/70" }: { value: number; max: number; className?: string }) {
  return (
    <div className="h-2 w-full min-w-24 overflow-hidden rounded-sm bg-slate-100">
      <div className={`h-full ${className}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireUser();
  const { denied } = await searchParams;
  const now = new Date();
  const [counts, aging, qcRules, workload, images, completenessRows, activity, overdue, total, missingAgg] = await Promise.all([
    statusCounts(),
    statusAging(),
    qcRuleBreakdown(),
    ownerWorkload(),
    db.product.groupBy({ by: ["imageStatus"], _count: { _all: true } }),
    db.product.findMany({ select: { completeness: true, status: true } }),
    db.auditLog.findMany({ where: { productId: { not: null } }, include: { actor: { select: { name: true } }, product: { select: { sku: true, id: true } } }, orderBy: { createdAt: "desc" }, take: 14 }),
    db.product.findMany({ where: { ...OPEN_WHERE, dueDate: { lt: now } }, select: { id: true, sku: true, nameEn: true, rmsName: true, status: true, dueDate: true, priority: true, owner: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 10 }),
    db.product.count(),
    db.$queryRaw<{ field: string; n: bigint }[]>`SELECT unnest("missingFields") AS field, count(*) AS n FROM "Product" GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
  ]);
  const c = (...s: (keyof typeof counts)[]) => s.reduce((a, k) => a + counts[k], 0);
  const maxStatus = Math.max(...Object.values(counts));
  const buckets = [
    { label: "0–24%", test: (v: number) => v < 25 }, { label: "25–49%", test: (v: number) => v >= 25 && v < 50 },
    { label: "50–74%", test: (v: number) => v >= 50 && v < 75 }, { label: "75–99%", test: (v: number) => v >= 75 && v < 100 },
    { label: "100%", test: (v: number) => v >= 100 },
  ].map((b) => ({ ...b, n: completenessRows.filter((r) => b.test(r.completeness)).length }));
  const maxBucket = Math.max(...buckets.map((b) => b.n));
  const imageCount = (s: string) => images.find((i) => i.imageStatus === s)?._count._all ?? 0;
  const ruleName = (code: string) => QC_RULES.find((r) => r.code === code)?.name ?? code;
  const overdueTotal = Object.values(aging).reduce((a, v) => a + v.overdue, 0);

  return (
    <div>
      <PageHeader title="Dashboard" description={`Operational overview · ${fmtDate(now, true)}`}
        actions={<Link href="/today" className="text-xs text-primary hover:underline">Open Today / Operations →</Link>} />
      {denied && <div className="mx-5 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">You do not have access to that page.</div>}
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-11">
          <Stat label="Total" value={total} href="/products" />
          <Stat label="New" value={c("NEW_IN_RMS", "RMS_QA")} href="/products?status=NEW_IN_RMS,RMS_QA" />
          <Stat label="In content" value={c("READY_FOR_CONTENT", "CONTENT_IN_PROGRESS")} href="/products?status=READY_FOR_CONTENT,CONTENT_IN_PROGRESS" />
          <Stat label="Awaiting images" value={c("AWAITING_IMAGES", "MISSING_IMAGES")} href="/products?status=AWAITING_IMAGES,MISSING_IMAGES" tone="amber" />
          <Stat label="Ready for QC" value={c("READY_FOR_QC", "QC_IN_PROGRESS")} href="/qc" />
          <Stat label="QC rejected" value={c("QC_REJECTED", "NEEDS_EDIT")} href="/products?status=QC_REJECTED,NEEDS_EDIT" tone="red" />
          <Stat label="QC approved" value={c("QC_APPROVED")} href="/products?status=QC_APPROVED" />
          <Stat label="Ready for Magento" value={c("READY_FOR_MAGENTO", "MAGENTO_LINKED")} href="/products?status=READY_FOR_MAGENTO,MAGENTO_LINKED" />
          <Stat label="Live" value={c("LIVE", "FINAL_REVIEW", "COMPLETED")} href="/products?status=LIVE,FINAL_REVIEW,COMPLETED" tone="green" />
          <Stat label="Blocked" value={c("BLOCKED", "MISSING_DATA", "PROCUREMENT_FOLLOW_UP")} href="/products?status=BLOCKED,MISSING_DATA,PROCUREMENT_FOLLOW_UP" tone="red" />
          <Stat label="Overdue" value={overdueTotal} href="/products?overdue=1" tone={overdueTotal ? "red" : "default"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Workflow pipeline" actions={<span className="text-[11px] text-muted-foreground">age = days in current status</span>} />
            <Table>
              <THead><tr><TH>Status</TH><TH className="text-right">Items</TH><TH className="w-1/3">Share</TH><TH className="text-right">Avg age</TH><TH className="text-right">Oldest</TH><TH className="text-right">Overdue</TH></tr></THead>
              <TBody>
                {[...MAIN_PATH, ...EXCEPTION_STATUSES].map((s) => (
                  <TR key={s}>
                    <TD><Link href={`/products?status=${s}`}><StatusBadge status={s} /></Link></TD>
                    <TD className="tabular text-right font-medium">{counts[s]}</TD>
                    <TD><Bar value={counts[s]} max={maxStatus} className={EXCEPTION_STATUSES.includes(s) ? "bg-orange-400" : "bg-primary/70"} /></TD>
                    <TD className="tabular text-right text-muted-foreground">{aging[s] ? aging[s].avgDays.toFixed(1) + "d" : "—"}</TD>
                    <TD className="tabular text-right text-muted-foreground">{aging[s] ? aging[s].maxDays.toFixed(0) + "d" : "—"}</TD>
                    <TD className={`tabular text-right ${aging[s]?.overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>{aging[s]?.overdue ?? 0}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="QC findings by rule" actions={<Link className="text-[11px] text-primary hover:underline" href="/qc">QC queue →</Link>} />
              <Table>
                <THead><tr><TH>Rule</TH><TH className="text-right">Products</TH><TH className="text-right">Err</TH><TH className="text-right">Review</TH><TH className="text-right">Warn</TH></tr></THead>
                <TBody>
                  {qcRules.length === 0 && <EmptyRow colSpan={5}>No QC findings.</EmptyRow>}
                  {qcRules.map(([code, v]) => (
                    <TR key={code}>
                      <TD>{ruleName(code)}</TD><TD className="tabular text-right font-medium">{v.products}</TD>
                      <TD className="tabular text-right text-red-600">{v.ERROR || "—"}</TD><TD className="tabular text-right text-violet-700">{v.NEEDS_REVIEW || "—"}</TD>
                      <TD className="tabular text-right text-amber-700">{v.WARNING || "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Completeness distribution" />
              <div className="space-y-1.5 p-3">
                {buckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-14 text-muted-foreground">{b.label}</span>
                    <Bar value={b.n} max={maxBucket} className={b.label === "100%" ? "bg-emerald-500" : "bg-teal-500/70"} />
                    <span className="tabular w-8 text-right font-medium">{b.n}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Owner workload (open items)" />
            <Table>
              <THead><tr><TH>Owner</TH><TH className="text-right">Open</TH><TH className="text-right">Overdue</TH><TH className="text-right">High/Urgent</TH></tr></THead>
              <TBody>
                {workload.map((w) => (
                  <TR key={w.id ?? "none"}>
                    <TD><Link className="hover:underline" href={`/products?owner=${w.id ?? "none"}&status=${[...MAIN_PATH.slice(0, 10), ...EXCEPTION_STATUSES].join(",")}`}>{w.name}</Link></TD>
                    <TD className="tabular text-right font-medium">{w.open}</TD>
                    <TD className={`tabular text-right ${w.overdue ? "text-red-600" : "text-muted-foreground"}`}>{w.overdue}</TD>
                    <TD className="tabular text-right text-muted-foreground">{w.urgent}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Images" actions={<Link className="text-[11px] text-primary hover:underline" href="/images">Images →</Link>} />
            <Table>
              <TBody>
                {IMAGE_STATUSES.map((s) => (
                  <TR key={s}><TD><Link href={`/products?images=${s}`}><ImageBadge status={s} /></Link></TD><TD className="tabular text-right font-medium">{imageCount(s)}</TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Most missing fields" />
            <Table>
              <TBody>
                {missingAgg.map((m) => (
                  <TR key={m.field}><TD><Link className="hover:underline" href={`/products?missing=${encodeURIComponent(m.field)}`}>{fieldLabel(m.field)}</Link></TD><TD className="tabular text-right font-medium">{Number(m.n)}</TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Overdue work" actions={<Link className="text-[11px] text-primary hover:underline" href="/products?overdue=1&sort=dueDate&dir=asc">All overdue →</Link>} />
            <Table>
              <THead><tr><TH>SKU</TH><TH>Product</TH><TH>Status</TH><TH>Owner</TH><TH>Priority</TH><TH>Due</TH></tr></THead>
              <TBody>
                {overdue.length === 0 && <EmptyRow colSpan={6}>Nothing overdue 🎉</EmptyRow>}
                {overdue.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/products/${p.id}`}>{p.sku}</Link></TD>
                    <TD className="max-w-[220px] truncate">{p.nameEn ?? p.rmsName}</TD>
                    <TD><StatusBadge status={p.status} /></TD><TD>{p.owner?.name ?? "—"}</TD><TD><PriorityBadge priority={p.priority} /></TD>
                    <TD className="whitespace-nowrap font-medium text-red-600">{fmtDate(p.dueDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Recent activity" actions={<Link className="text-[11px] text-primary hover:underline" href="/reports?tab=audit">Audit log →</Link>} />
            <Table>
              <TBody>
                {activity.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{relTime(a.createdAt)}</TD>
                    <TD className="whitespace-nowrap">{a.actor?.name ?? "System"}</TD>
                    <TD className="max-w-[320px] truncate">
                      {a.action === "STATUS_CHANGE" ? <>moved to <b>{STATUS_LABELS[a.newValue as keyof typeof STATUS_LABELS] ?? a.newValue}</b></>
                        : a.action === "UPDATE" ? <>changed <b>{fieldLabel(a.field ?? "")}</b></> : a.action.toLowerCase()}
                    </TD>
                    <TD className="font-mono text-[12px]">{a.product && <Link className="text-primary hover:underline" href={`/products/${a.product.id}`}>{a.product.sku}</Link>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}
