import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { OPEN_WHERE } from "@/lib/server/stats";
import { PageHeader } from "@/components/pim/page-header";
import { MiniTable, miniSelect } from "@/components/pim/mini-table";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TR, TD, EmptyRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MarkSeen } from "./mark-seen";
import { fieldLabel } from "@/lib/labels";
import { cn, relTime } from "@/lib/utils";

export const metadata = { title: "My Tasks" };

const TABS = [
  ["open", "Assigned to me"], ["overdue", "Overdue"], ["week", "Due in 7 days"], ["qc", "My QC reviews"], ["mentions", "Mentions"], ["done", "Recently completed"],
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tab = (await searchParams).tab ?? "open";
  const now = new Date();
  const week = new Date(Date.now() + 7 * 86400_000);
  const where: Record<"open" | "overdue" | "week" | "qc" | "done", Prisma.ProductWhereInput> = {
    open: { ...OPEN_WHERE, ownerId: user.id },
    overdue: { ...OPEN_WHERE, ownerId: user.id, dueDate: { lt: now } },
    week: { ...OPEN_WHERE, ownerId: user.id, dueDate: { gte: now, lte: week } },
    qc: { qcReviewerId: user.id, status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS", "FINAL_REVIEW"] } },
    done: { OR: [{ ownerId: user.id }, { qcReviewerId: user.id }], status: { in: ["LIVE", "FINAL_REVIEW", "COMPLETED"] } },
  };
  const counts = await Promise.all((["open", "overdue", "week", "qc", "done"] as const).map((k) => db.product.count({ where: where[k] })));
  const countMap: Record<string, number> = { open: counts[0], overdue: counts[1], week: counts[2], qc: counts[3], done: counts[4] };
  const mentions = await db.mention.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60,
    include: { comment: { include: { author: { select: { name: true } }, product: { select: { id: true, sku: true, nameEn: true } } } } },
  });
  countMap.mentions = mentions.filter((m) => !m.seen).length;
  const rows = tab !== "mentions" && tab in where
    ? await db.product.findMany({ where: where[tab as keyof typeof where], select: miniSelect, orderBy: tab === "done" ? { statusChangedAt: "desc" } : [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }], take: 200 })
    : [];
  return (
    <div>
      <PageHeader title="My Tasks" description="Work assigned to you, reviews waiting on you and mentions." />
      <div className="flex gap-1 border-b bg-card px-5">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/tasks?tab=${k}`} className={cn("-mb-px border-b-2 px-2.5 py-2 text-[12.5px]", tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label} <span className={cn("tabular ml-1 rounded px-1.5 text-[10px]", k === "overdue" && countMap[k] ? "bg-red-100 text-red-700" : "bg-slate-100")}>{countMap[k] ?? 0}</span>
          </Link>
        ))}
      </div>
      <div className="p-5">
        {tab === "mentions" ? (
          <Card>
            <CardHeader title="Mentions" actions={countMap.mentions ? <MarkSeen /> : undefined} />
            <Table>
              <TBody>
                {mentions.length === 0 && <EmptyRow colSpan={4}>No mentions yet.</EmptyRow>}
                {mentions.map((m) => (
                  <TR key={m.id} className={cn(!m.seen && "bg-amber-50/50")}>
                    <TD className="w-24 whitespace-nowrap text-muted-foreground">{relTime(m.createdAt)}</TD>
                    <TD className="whitespace-nowrap">{m.comment.author.name}{!m.seen && <Badge tone="amber" className="ml-1">new</Badge>}</TD>
                    <TD className="max-w-xl"><div className="truncate" dir="auto">{m.comment.body}</div>
                      {m.comment.fieldKey && <span className="text-[11px] text-muted-foreground">on {fieldLabel(m.comment.fieldKey)}</span>}</TD>
                    <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/products/${m.comment.product.id}`}>{m.comment.product.sku}</Link></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ) : (
          <MiniTable title={TABS.find(([k]) => k === tab)?.[1] ?? "Tasks"} rows={rows} showQc={tab === "qc"} showAge={tab === "done"} linkBase={tab === "qc" ? "/qc" : "/products"} empty="Nothing here – nice." />
        )}
      </div>
    </div>
  );
}
