import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { attributeValueMap, evaluate, loadTransitions, productInclude } from "@/lib/server/products";
import { availableTransitions, evaluateTransition, type WorkflowStatus } from "@/lib/domain/workflow";
import { can, canEditField } from "@/lib/domain/rbac";
import { compareField, COMPARE_FIELDS, type CompareState } from "@/lib/domain/compare";
import { deriveWeightKg, parseSize } from "@/lib/domain/units";
import { EDITABLE_FIELDS } from "@/lib/server/products";
import { ProductDetail } from "./product-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, select: { sku: true } });
  return { title: p ? `SKU ${p.sku}` : "Product" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id }, include: productInclude });
  if (!product) notFound();

  const [ev, rules, users, brands, categories, attributeSets, attrDefs, comments, history, rmsSnaps, magentoSnaps, flags, reviews] = await Promise.all([
    evaluate(product),
    loadTransitions(),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.brand.findMany({ where: { active: true }, select: { id: true, name: true, nameAr: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { active: true }, select: { id: true, path: true, name: true }, orderBy: { path: "asc" } }),
    db.attributeSet.findMany({ select: { id: true, name: true, code: true } }),
    db.attributeDefinition.findMany({ where: { active: true }, orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
    db.comment.findMany({ where: { productId: id }, include: { author: { select: { name: true } }, resolvedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { productId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.rmsSnapshot.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 2 }),
    db.magentoSnapshot.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.qcFlag.findMany({ where: { productId: id }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.qcReview.findMany({ where: { productId: id }, include: { reviewer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  // attributes applicable: attribute set items + category requirements (+ everything else as optional)
  const [setItems, catAttrs] = await Promise.all([
    product.attributeSetId ? db.attributeSetItem.findMany({ where: { attributeSetId: product.attributeSetId } }) : Promise.resolve([]),
    ev.lineage.length ? db.categoryAttribute.findMany({ where: { categoryId: { in: ev.lineage.map((l) => l.id) } } }) : Promise.resolve([]),
  ]);
  const requiredIds = new Set([...setItems.filter((i) => i.required), ...catAttrs.filter((c) => c.required)].map((i) => i.attributeId));
  const inSetIds = new Set([...setItems, ...catAttrs].map((i) => i.attributeId));
  const attrValues = product.attributeValues.map((v) => ({
    attributeId: v.attributeId, locale: v.locale,
    value: v.valueText ?? v.valueNumber ?? v.valueBool ?? (v.valueDate ? v.valueDate.toISOString().slice(0, 10) : null) ?? (v.valueJson as string[] | null),
  }));

  // transitions with validation results
  const transitions = availableTransitions(product.status as WorkflowStatus, user.role, rules, product.previousStatus as WorkflowStatus | null).map(({ rule, target }) => {
    const r = evaluateTransition(target, { role: user.role, status: product.status as WorkflowStatus, previousStatus: product.previousStatus as WorkflowStatus | null,
      reason: "placeholder-reason", checks: ev.checks, details: ev.details }, rules);
    return { target, label: rule.label, reasonRequired: rule.reasonRequired, blockers: r.errors };
  });

  // comparison RMS / PIM / Magento
  const magentoMerged: Record<string, unknown> = {};
  let magentoAt: Date | null = null;
  for (const s of [...magentoSnaps].reverse()) {
    Object.assign(magentoMerged, s.data as Record<string, unknown>);
    magentoAt = s.createdAt;
  }
  const rmsLatest = (rmsSnaps[0]?.data as Record<string, unknown>) ?? {};
  const rmsPrev = (rmsSnaps[1]?.data as Record<string, unknown>) ?? null;
  const pimValues: Record<string, unknown> = {
    ...product, brand: product.brand?.name ?? null,
    categories: [product.primaryCategory?.path, ...product.categories.map((c) => c.category.path)].filter(Boolean),
  };
  const lastPimChange = history.find((h) => h.action === "UPDATE")?.createdAt ?? product.createdAt;
  const hasMagento = magentoSnaps.length > 0;
  const comparison = COMPARE_FIELDS.map((f) => {
    const res = compareField({ rms: f.rmsKey ? rmsLatest[f.rmsKey] : undefined, pim: pimValues[f.key], magento: magentoMerged[f.key],
      magentoNewer: !!magentoAt && magentoAt > lastPimChange && magentoSnaps[0]?.source === "import" }, hasMagento);
    return { key: f.key, label: f.label, rms: f.rmsKey ? rmsLatest[f.rmsKey] ?? null : null, pim: pimValues[f.key] ?? null, magento: hasMagento ? magentoMerged[f.key] ?? null : null, state: res.state as CompareState, note: res.note };
  });
  const rmsChanges = rmsPrev
    ? Object.keys({ ...rmsPrev, ...rmsLatest }).filter((k) => JSON.stringify(rmsPrev[k] ?? null) !== JSON.stringify(rmsLatest[k] ?? null))
        .map((k) => ({ field: k, before: rmsPrev[k] ?? null, after: rmsLatest[k] ?? null }))
    : [];

  const size = parseSize(product.volumeWeightEn || product.volumeWeightAr);
  const editable = Object.fromEntries(Object.keys(EDITABLE_FIELDS).map((f) => [f, canEditField(user.role, f)]));

  return (
    <ProductDetail
      product={{ ...product, attributeValues: undefined }}
      evaluation={{
        completeness: ev.completeness, qc: ev.qc, checks: ev.checks, details: ev.details, duplicates: ev.duplicates, lineage: ev.lineage,
      }}
      size={{ ...size, suggestedWeightKg: deriveWeightKg(size) }}
      transitions={transitions}
      options={{ users, brands, categories, attributeSets }}
      attributes={attrDefs.map((a) => ({ id: a.id, code: a.code, label: a.label, labelAr: a.labelAr, type: a.type, options: (a.options as { value: string; label: string }[] | null) ?? [],
        unit: a.unit, localized: a.localized, group: a.group, helpText: a.helpText, required: requiredIds.has(a.id), inSet: inSetIds.has(a.id) }))}
      attributeValues={attrValues}
      attributeMap={attributeValueMap(product)}
      comments={comments.map((c) => ({ id: c.id, body: c.body, fieldKey: c.fieldKey, parentId: c.parentId, resolved: c.resolved, author: c.author.name,
        resolvedBy: c.resolvedBy?.name ?? null, resolvedAt: c.resolvedAt, createdAt: c.createdAt }))}
      history={history.map((h) => ({ id: h.id, action: h.action, field: h.field, oldValue: h.oldValue, newValue: h.newValue, source: h.source, reason: h.reason,
        actor: h.actor?.name ?? "System", createdAt: h.createdAt }))}
      comparison={comparison}
      rmsChanges={rmsChanges}
      rmsSnapshotAt={rmsSnaps[0]?.createdAt ?? null}
      magentoSnapshotAt={magentoAt}
      flags={flags.map((f) => ({ id: f.id, fieldKey: f.fieldKey, message: f.message, severity: f.severity, suspected: f.suspected, resolved: f.resolved, createdBy: f.createdBy.name, createdAt: f.createdAt }))}
      reviews={reviews.map((r) => ({ id: r.id, decision: r.decision, outcome: r.outcome, score: r.score, notes: r.notes, reviewer: r.reviewer.name, createdAt: r.createdAt }))}
      perms={{ editable, comment: can(user.role, "comment.create"), qc: can(user.role, "qc.review"), images: can(user.role, "images.manage") }}
      users={users.map((u) => u.name)}
    />
  );
}
