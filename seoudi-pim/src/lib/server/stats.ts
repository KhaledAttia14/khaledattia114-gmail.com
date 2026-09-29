import "server-only";
import { db } from "./db";
import type { QcIssue } from "@/lib/domain/qc";
import { WORKFLOW_STATUSES, type WorkflowStatus } from "@/lib/domain/workflow";

import type { Prisma, WorkflowStatus as DbStatus } from "@prisma/client";

export const DONE_STATUSES: DbStatus[] = ["LIVE", "FINAL_REVIEW", "COMPLETED"];
export const OPEN_WHERE = { status: { notIn: DONE_STATUSES } } satisfies Prisma.ProductWhereInput;

export async function statusCounts(): Promise<Record<WorkflowStatus, number>> {
  const rows = await db.product.groupBy({ by: ["status"], _count: { _all: true } });
  const out = Object.fromEntries(WORKFLOW_STATUSES.map((s) => [s, 0])) as Record<WorkflowStatus, number>;
  for (const r of rows) out[r.status as WorkflowStatus] = r._count._all;
  return out;
}

export async function statusAging(): Promise<Record<string, { avgDays: number; maxDays: number; overdue: number }>> {
  const rows = await db.product.findMany({ select: { status: true, statusChangedAt: true, dueDate: true } });
  const now = Date.now();
  const acc: Record<string, { sum: number; n: number; max: number; overdue: number }> = {};
  for (const r of rows) {
    const d = (now - r.statusChangedAt.getTime()) / 86400_000;
    const a = (acc[r.status] ??= { sum: 0, n: 0, max: 0, overdue: 0 });
    a.sum += d; a.n++; a.max = Math.max(a.max, d);
    if (r.dueDate && r.dueDate.getTime() < now && !DONE_STATUSES.includes(r.status)) a.overdue++;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { avgDays: v.sum / v.n, maxDays: v.max, overdue: v.overdue }]));
}

export async function qcRuleBreakdown() {
  const rows = await db.product.findMany({ select: { qcIssues: true } });
  const byRule: Record<string, { ERROR: number; WARNING: number; NEEDS_REVIEW: number; products: number }> = {};
  for (const r of rows) {
    const issues = (r.qcIssues as QcIssue[] | null) ?? [];
    const seen = new Set<string>();
    for (const i of issues) {
      const b = (byRule[i.rule] ??= { ERROR: 0, WARNING: 0, NEEDS_REVIEW: 0, products: 0 });
      if (i.outcome !== "PASS") b[i.outcome]++;
      if (!seen.has(i.rule)) { b.products++; seen.add(i.rule); }
    }
  }
  return Object.entries(byRule).sort((a, b) => b[1].products - a[1].products);
}

export async function ownerWorkload() {
  const now = new Date();
  const [open, overdue, urgent, users] = await Promise.all([
    db.product.groupBy({ by: ["ownerId"], where: OPEN_WHERE, _count: { _all: true } }),
    db.product.groupBy({ by: ["ownerId"], where: { ...OPEN_WHERE, dueDate: { lt: now } }, _count: { _all: true } }),
    db.product.groupBy({ by: ["ownerId"], where: { ...OPEN_WHERE, priority: { in: ["HIGH", "URGENT"] } }, _count: { _all: true } }),
    db.user.findMany({ select: { id: true, name: true, role: true } }),
  ]);
  const get = (arr: { ownerId: string | null; _count: { _all: number } }[], id: string | null) => arr.find((x) => x.ownerId === id)?._count._all ?? 0;
  const ids = Array.from(new Set(open.map((o) => o.ownerId)));
  return ids.map((id) => ({
    id, name: id ? users.find((u) => u.id === id)?.name ?? "?" : "Unassigned", role: id ? users.find((u) => u.id === id)?.role : null,
    open: get(open, id), overdue: get(overdue, id), urgent: get(urgent, id),
  })).sort((a, b) => b.open - a.open);
}
