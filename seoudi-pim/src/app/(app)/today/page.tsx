import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { OPEN_WHERE } from "@/lib/server/stats";
import { PageHeader, Stat } from "@/components/pim/page-header";
import { MiniTable, miniSelect } from "@/components/pim/mini-table";
import { ROLE_LABELS } from "@/lib/domain/rbac";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const mine = { ownerId: user.id };
  const [dueToday, overdue, urgent, waitingQc, rejected, blocked, readyMagento, unassigned, mentions, doneToday] = await Promise.all([
    db.product.findMany({ where: { ...OPEN_WHERE, dueDate: { gte: start, lte: end } }, select: miniSelect, orderBy: { priority: "desc" }, take: 25 }),
    db.product.findMany({ where: { ...OPEN_WHERE, dueDate: { lt: start } }, select: miniSelect, orderBy: { dueDate: "asc" }, take: 25 }),
    db.product.findMany({ where: { ...OPEN_WHERE, priority: { in: ["URGENT", "HIGH"] } }, select: miniSelect, orderBy: [{ priority: "desc" }, { dueDate: "asc" }], take: 25 }),
    db.product.findMany({ where: { status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS"] } }, select: miniSelect, orderBy: { statusChangedAt: "asc" }, take: 25 }),
    db.product.findMany({ where: { status: { in: ["QC_REJECTED", "NEEDS_EDIT"] } }, select: miniSelect, orderBy: { statusChangedAt: "asc" }, take: 25 }),
    db.product.findMany({ where: { status: { in: ["BLOCKED", "MISSING_DATA", "PROCUREMENT_FOLLOW_UP", "MISSING_IMAGES"] } }, select: miniSelect, orderBy: { statusChangedAt: "asc" }, take: 25 }),
    db.product.findMany({ where: { status: { in: ["QC_APPROVED", "READY_FOR_MAGENTO"] } }, select: miniSelect, orderBy: { statusChangedAt: "asc" }, take: 25 }),
    db.product.findMany({ where: { ...OPEN_WHERE, ownerId: null }, select: miniSelect, orderBy: { createdAt: "asc" }, take: 25 }),
    db.mention.count({ where: { userId: user.id, seen: false } }),
    db.auditLog.count({ where: { action: "STATUS_CHANGE", createdAt: { gte: start } } }),
  ]);
  const myOpen = await db.product.count({ where: { ...OPEN_WHERE, ...mine } });
  const myOverdue = await db.product.count({ where: { ...OPEN_WHERE, ...mine, dueDate: { lt: start } } });
  return (
    <div>
      <PageHeader title="Today · Operations control center" description={`${user.name} (${ROLE_LABELS[user.role]}) · ${start.toDateString()}`}
        actions={<Link href="/tasks" className="text-xs text-primary hover:underline">My tasks →</Link>} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="My open items" value={myOpen} href="/tasks" />
          <Stat label="My overdue" value={myOverdue} href="/tasks?tab=overdue" tone={myOverdue ? "red" : "default"} />
          <Stat label="Unread mentions" value={mentions} href="/tasks?tab=mentions" tone={mentions ? "amber" : "default"} />
          <Stat label="Due today" value={dueToday.length} tone="amber" />
          <Stat label="Overdue (all)" value={overdue.length} tone={overdue.length ? "red" : "default"} href="/products?overdue=1" />
          <Stat label="Waiting on QC" value={waitingQc.length} href="/qc" />
          <Stat label="Needs rework" value={rejected.length} href="/products?status=QC_REJECTED,NEEDS_EDIT" tone="red" />
          <Stat label="Status moves today" value={doneToday} tone="green" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <MiniTable title="Due today" rows={dueToday} href="/products?sort=dueDate&dir=asc" empty="Nothing due today." />
          <MiniTable title="Overdue" rows={overdue} href="/products?overdue=1&sort=dueDate&dir=asc" empty="Nothing overdue." />
          <MiniTable title="Urgent & high priority" rows={urgent} href="/products?priority=URGENT,HIGH" />
          <MiniTable title="Waiting on QC (oldest first)" rows={waitingQc} href="/qc" showQc showAge linkBase="/qc" />
          <MiniTable title="Rejected / needs edit" rows={rejected} href="/products?status=QC_REJECTED,NEEDS_EDIT" showAge />
          <MiniTable title="Blocked, missing data & follow-ups" rows={blocked} href="/products?status=BLOCKED,MISSING_DATA,PROCUREMENT_FOLLOW_UP,MISSING_IMAGES" showAge />
          <MiniTable title="Ready to prepare / export for Magento" rows={readyMagento} href="/exports" showAge />
          <MiniTable title="Unassigned open items" rows={unassigned} href="/products?owner=none" />
        </div>
      </div>
    </div>
  );
}
