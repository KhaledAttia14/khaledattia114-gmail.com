import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { evaluate, productInclude } from "@/lib/server/products";
import { can } from "@/lib/domain/rbac";
import { QcReview } from "./qc-review";

export const metadata = { title: "QC review" };

export default async function QcReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, include: productInclude });
  if (!p) notFound();
  // changes since the item was last submitted to QC (or last review)
  const lastReview = await db.qcReview.findFirst({ where: { productId: id }, orderBy: { createdAt: "desc" } });
  const submitted = await db.auditLog.findFirst({ where: { productId: id, action: "STATUS_CHANGE", newValue: "READY_FOR_QC" }, orderBy: { createdAt: "desc" } });
  const since = lastReview?.createdAt ?? submitted?.createdAt ?? new Date(0);
  const [ev, changes, flags, comments, rms, users, queue] = await Promise.all([
    evaluate(p),
    db.auditLog.findMany({ where: { productId: id, action: "UPDATE", createdAt: { gte: since } }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.qcFlag.findMany({ where: { productId: id }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.comment.findMany({ where: { productId: id, fieldKey: { not: null } }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.rmsSnapshot.findFirst({ where: { productId: id }, orderBy: { createdAt: "desc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["CONTENT_CREATOR", "ECOMMERCE_SPECIALIST", "ADMIN"] } }, select: { id: true, name: true } }),
    db.product.findMany({ where: { status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS"] }, id: { not: id } }, orderBy: [{ priority: "desc" }, { statusChangedAt: "asc" }], select: { id: true }, take: 1 }),
  ]);
  return (
    <QcReview
      product={omitAttributeValues(p)}
      qc={ev.qc}
      completeness={ev.completeness}
      duplicates={ev.duplicates}
      rms={(rms?.data as Record<string, unknown>) ?? {}}
      changes={changes.map((c) => ({ id: c.id, field: c.field ?? "", oldValue: c.oldValue, newValue: c.newValue, actor: c.actor?.name ?? "System", createdAt: c.createdAt }))}
      since={since.getTime() === 0 ? null : since}
      flags={flags.map((f) => ({ id: f.id, fieldKey: f.fieldKey, message: f.message, severity: f.severity, suspected: f.suspected, resolved: f.resolved, createdBy: f.createdBy.name, createdAt: f.createdAt }))}
      fieldComments={comments.map((c) => ({ id: c.id, fieldKey: c.fieldKey!, body: c.body, author: c.author.name, resolved: c.resolved, createdAt: c.createdAt }))}
      users={users}
      nextId={queue[0]?.id ?? null}
      canReview={can(user.role, "qc.review")}
    />
  );
}

function omitAttributeValues<T extends { attributeValues: unknown }>(p: T): Omit<T, "attributeValues"> {
  const rest: Partial<T> = { ...p };
  delete rest.attributeValues;
  return rest as Omit<T, "attributeValues">;
}
