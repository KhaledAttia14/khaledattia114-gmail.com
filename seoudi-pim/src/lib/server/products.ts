import "server-only";
import { Prisma, type AuditSource, type WorkflowStatus as DbStatus } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import type { SessionUser } from "./auth";
import { ForbiddenError } from "./errors";
import {
  computeCompleteness, stageComplete, missingUpTo, type CompletenessResult, type CompletenessRuleInput, type Stage,
} from "@/lib/domain/completeness";
import { runQc, worst, type QcDuplicates, type QcResult, type QcRuleConfig } from "@/lib/domain/qc";
import { canEditField } from "@/lib/domain/rbac";
import { similarity, slugify } from "@/lib/domain/text";
import { parseSize } from "@/lib/domain/units";
import {
  evaluateTransition, type TransitionRule, type ValidationCode, type WorkflowStatus, STATUS_LABELS,
} from "@/lib/domain/workflow";

export const productInclude = {
  brand: true,
  primaryCategory: true,
  categories: { include: { category: true } },
  owner: { select: { id: true, name: true, role: true } },
  qcReviewer: { select: { id: true, name: true, role: true } },
  images: { orderBy: [{ role: "asc" }, { sortOrder: "asc" }] },
  attributeValues: { include: { attribute: true } },
  attributeSet: true,
} satisfies Prisma.ProductInclude;

export type FullProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/* ------------------------------------------------------------------ config */

export async function loadCompletenessRules(): Promise<CompletenessRuleInput[]> {
  const rows = await db.completenessRule.findMany({ where: { active: true } });
  return rows.map((r) => ({ stage: r.stage as Stage, fieldKey: r.fieldKey, label: r.label, categoryId: r.categoryId, attributeSetId: r.attributeSetId }));
}

export async function loadQcRules(): Promise<QcRuleConfig[]> {
  const rows = await db.qcRule.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ code: r.code, severity: r.severity, active: r.active, config: (r.config as Record<string, unknown>) ?? null }));
}

export async function loadTransitions(): Promise<TransitionRule[]> {
  const rows = await db.workflowTransitionRule.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({
    fromStatus: r.fromStatus, toStatus: r.toStatus, label: r.label, allowedRoles: r.allowedRoles,
    validations: r.validations, reasonRequired: r.reasonRequired, active: r.active, sortOrder: r.sortOrder,
  }));
}

export async function categoryLineage(categoryId: string | null | undefined): Promise<{ id: string; name: string; path: string }[]> {
  if (!categoryId) return [];
  const all = await db.category.findMany({ select: { id: true, parentId: true, name: true, path: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  const out: { id: string; name: string; path: string }[] = [];
  let cur = byId.get(categoryId);
  let guard = 0;
  while (cur && guard++ < 20) {
    out.unshift({ id: cur.id, name: cur.name, path: cur.path });
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export async function requiredAttributes(p: Pick<FullProduct, "attributeSetId" | "primaryCategoryId">) {
  const lineage = (await categoryLineage(p.primaryCategoryId)).map((c) => c.id);
  const [setItems, catItems] = await Promise.all([
    p.attributeSetId
      ? db.attributeSetItem.findMany({ where: { attributeSetId: p.attributeSetId, required: true }, include: { attribute: true } })
      : Promise.resolve([]),
    lineage.length
      ? db.categoryAttribute.findMany({ where: { categoryId: { in: lineage }, required: true }, include: { attribute: true } })
      : Promise.resolve([]),
  ]);
  const map = new Map<string, { code: string; label: string }>();
  for (const i of [...setItems, ...catItems]) if (i.attribute.active) map.set(i.attribute.code, { code: i.attribute.code, label: i.attribute.label });
  return { lineage, attributes: [...map.values()] };
}

export function attributeValueMap(p: Pick<FullProduct, "attributeValues">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of p.attributeValues) {
    const val = v.valueText ?? v.valueNumber ?? v.valueBool ?? v.valueDate ?? (v.valueJson as unknown) ?? null;
    const key = v.locale === "all" ? v.attribute.code : `${v.attribute.code}`;
    if (out[key] == null || out[key] === "") out[key] = val;
  }
  return out;
}

/* ------------------------------------------------------------ duplicates */

export async function findDuplicates(p: FullProduct): Promise<QcDuplicates> {
  const others = { id: { not: p.id } };
  const [barcode, nameEn, nameAr, urlKey, sameBrand] = await Promise.all([
    p.barcode ? db.product.findMany({ where: { ...others, OR: [{ barcode: p.barcode }, { sku: p.barcode }] }, select: { sku: true }, take: 5 }) : [],
    p.nameEn ? db.product.findMany({ where: { ...others, nameEn: { equals: p.nameEn, mode: "insensitive" } }, select: { sku: true }, take: 5 }) : [],
    p.nameAr ? db.product.findMany({ where: { ...others, nameAr: p.nameAr }, select: { sku: true }, take: 5 }) : [],
    p.urlKey ? db.product.findMany({ where: { ...others, urlKey: p.urlKey }, select: { sku: true }, take: 5 }) : [],
    p.brandId && p.nameEn
      ? db.product.findMany({ where: { ...others, brandId: p.brandId, nameEn: { not: null } }, select: { sku: true, nameEn: true }, take: 400 })
      : [],
  ]);
  const exact = new Set(nameEn.map((x) => x.sku));
  const similar = sameBrand
    .filter((o) => !exact.has(o.sku) && o.nameEn && similarity(o.nameEn, p.nameEn!) >= 0.93)
    .map((o) => o.sku)
    .slice(0, 5);
  return {
    barcode: barcode.map((x) => x.sku),
    nameEn: nameEn.map((x) => x.sku),
    nameAr: nameAr.map((x) => x.sku),
    urlKey: urlKey.map((x) => x.sku),
    similarNameEn: similar,
  };
}

/* ------------------------------------------------------------ evaluation */

export interface Evaluation {
  completeness: CompletenessResult;
  qc: QcResult;
  checks: Partial<Record<ValidationCode, boolean>>;
  details: Partial<Record<ValidationCode, string>>;
  duplicates: QcDuplicates;
  openFlags: number;
  lineage: { id: string; name: string; path: string }[];
}

function mainImage(p: FullProduct) {
  return p.images.find((i) => i.role === "MAIN") ?? null;
}

export async function evaluate(p: FullProduct, cache?: { completeness?: CompletenessRuleInput[]; qc?: QcRuleConfig[] }): Promise<Evaluation> {
  const [cRules, qRules, req, duplicates, openFlags, lineage] = await Promise.all([
    cache?.completeness ?? loadCompletenessRules(),
    cache?.qc ?? loadQcRules(),
    requiredAttributes(p),
    findDuplicates(p),
    db.qcFlag.count({ where: { productId: p.id, resolved: false } }),
    categoryLineage(p.primaryCategoryId),
  ]);
  const completeness = computeCompleteness(
    { ...p, attributes: attributeValueMap(p), images: p.images.map((i) => ({ role: i.role, status: i.status, url: i.url })) },
    cRules,
    { categoryLineage: req.lineage, requiredAttributes: req.attributes },
  );
  const qc = runQc(
    {
      sku: p.sku, barcode: p.barcode, rmsName: p.rmsName, brandName: p.brand?.name, brandNameAr: p.brand?.nameAr,
      productType: p.productType, nameEn: p.nameEn, nameAr: p.nameAr, descriptionEn: p.descriptionEn, descriptionAr: p.descriptionAr,
      volumeWeightEn: p.volumeWeightEn, volumeWeightAr: p.volumeWeightAr, weightKg: p.weightKg, metaTitleEn: p.metaTitleEn,
      metaTitleAr: p.metaTitleAr, metaDescriptionEn: p.metaDescriptionEn, metaDescriptionAr: p.metaDescriptionAr, urlKey: p.urlKey,
      model: p.model, color: p.color,
    },
    qRules,
    duplicates,
  );
  const img = mainImage(p);
  const imagesReady = !!img && (img.status === "READY" || img.status === "AVAILABLE") && !!img.url;
  const exported = p.magentoId != null || (await db.magentoSnapshot.count({ where: { productId: p.id, source: "export" } })) > 0;
  const checks: Evaluation["checks"] = {
    HAS_RMS_DATA: !!p.sku && !!(p.rmsName || p.nameEn || p.nameAr),
    HAS_BRAND_AND_CATEGORY: !!p.brandId && !!p.primaryCategoryId,
    RMS_COMPLETE: stageComplete(completeness, "RMS"),
    CONTENT_COMPLETE: stageComplete(completeness, "CONTENT"),
    IMAGES_READY: imagesReady,
    QC_EVALUATED: true,
    QC_NO_ERRORS: qc.outcome !== "ERROR",
    NO_OPEN_FLAGS: openFlags === 0,
    MAGENTO_COMPLETE: stageComplete(completeness, "MAGENTO"),
    URL_KEY_UNIQUE: !!p.urlKey && !(duplicates.urlKey ?? []).length,
    MAGENTO_LINKED: exported,
  };
  const details: Evaluation["details"] = {
    RMS_COMPLETE: missingUpTo(completeness, "RMS").join(", "),
    CONTENT_COMPLETE: missingUpTo(completeness, "CONTENT").join(", "),
    MAGENTO_COMPLETE: missingUpTo(completeness, "MAGENTO").join(", "),
    IMAGES_READY: img ? `main image is ${img.status}${img.url ? "" : " (no URL)"}` : "no main image",
    QC_NO_ERRORS: qc.issues.filter((i) => i.outcome === "ERROR").map((i) => i.message).slice(0, 3).join("; "),
    NO_OPEN_FLAGS: `${openFlags} open flag(s)`,
    URL_KEY_UNIQUE: p.urlKey ? `also used by ${(duplicates.urlKey ?? []).join(", ")}` : "URL key empty",
  };
  return { completeness, qc, checks, details, duplicates, openFlags, lineage };
}

/** Recalculate and persist completeness, QC and image summary for one product. */
export async function recompute(productId: string, cache?: { completeness?: CompletenessRuleInput[]; qc?: QcRuleConfig[] }): Promise<Evaluation> {
  const p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
  const ev = await evaluate(p, cache);
  const img = mainImage(p);
  const hasContent = !!(p.nameEn || p.nameAr); // QC is meaningless before content exists
  await db.product.update({
    where: { id: productId },
    data: {
      completeness: ev.completeness.percent,
      missingFields: ev.completeness.missing.map((m) => m.key),
      qcOutcome: hasContent ? ev.qc.outcome : null,
      qcScore: hasContent ? ev.qc.score : null,
      qcIssues: hasContent ? (ev.qc.issues as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      qcCheckedAt: new Date(),
      ...(img ? { imageStatus: img.status } : {}),
    },
  });
  return ev;
}

/* ------------------------------------------------------------ updates */

type FieldType = "string" | "text" | "number" | "boolean" | "skuList" | "date" | "enum" | "ref";

export const EDITABLE_FIELDS: Record<string, FieldType> = {
  barcode: "string", rmsName: "string", rmsBrand: "string", rmsCategory: "string",
  brandId: "ref", productLine: "string", productType: "string",
  nameEn: "string", nameAr: "string", descriptionEn: "text", descriptionAr: "text",
  shortDescriptionEn: "text", shortDescriptionAr: "text", volumeWeightEn: "string", volumeWeightAr: "string",
  weightKg: "number", dimensions: "string", model: "string", color: "string", flavor: "string", variant: "string", origin: "string",
  primaryCategoryId: "ref", attributeSetId: "ref",
  storeViewCode: "string", magentoProductType: "string", attributeSetCode: "string", visibility: "string", productOnline: "boolean",
  metaTitleEn: "string", metaTitleAr: "string", metaDescriptionEn: "text", metaDescriptionAr: "text", urlKey: "string",
  relatedSkus: "skuList", crosssellSkus: "skuList", upsellSkus: "skuList", additionalAttributes: "string", magentoId: "number",
  priority: "enum", campaign: "string", dueDate: "date", ownerId: "ref", qcReviewerId: "ref", notes: "text", imageStatus: "enum",
};

export function coerce(type: FieldType, v: unknown): unknown {
  if (v === undefined) return undefined;
  switch (type) {
    case "string":
    case "text":
    case "enum":
    case "ref": {
      if (v == null) return null;
      const s = String(v).replace(/\r\n/g, "\n");
      const t = type === "text" ? s.trim() : s.trim().replace(/\s+/g, " ");
      return t.length ? t : null;
    }
    case "number": {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(",", "."));
      if (Number.isNaN(n)) throw new Error(`"${v}" is not a number`);
      return n;
    }
    case "boolean":
      return v === true || v === "true" || v === "on" || v === "1" || v === 1;
    case "skuList":
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      return String(v ?? "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    case "date":
      if (v == null || v === "") return null;
      return new Date(String(v));
  }
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return (a ? new Date(a as Date).getTime() : null) === (b ? new Date(b as Date).getTime() : null);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? null) === (b ?? null);
}

export interface UpdateOptions {
  source?: AuditSource;
  reason?: string | null;
  skipPermission?: boolean;
  skipRecompute?: boolean;
}

/** Apply a field patch with permission checks and field-level audit. Returns changed field names. */
export async function updateProduct(productId: string, patch: Record<string, unknown>, actor: SessionUser | null, opts: UpdateOptions = {}) {
  const current = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const data: Record<string, unknown> = {};
  const changes: { field: string; old: unknown; new: unknown }[] = [];
  for (const [field, raw] of Object.entries(patch)) {
    const type = EDITABLE_FIELDS[field];
    if (!type) continue;
    if (!opts.skipPermission && actor && !canEditField(actor.role, field)) throw new ForbiddenError(`Your role cannot edit ${field}`);
    const value = coerce(type, raw);
    if (value === undefined) continue;
    const old = (current as Record<string, unknown>)[field];
    if (same(old, value)) continue;
    data[field] = value;
    changes.push({ field, old, new: value });
  }
  // structured size derived from the customer-facing size text
  const sizeText = (data.volumeWeightEn ?? current.volumeWeightEn ?? data.volumeWeightAr ?? current.volumeWeightAr) as string | null;
  if ("volumeWeightEn" in data || "volumeWeightAr" in data) {
    const ps = parseSize(sizeText);
    const derived = {
      sizeKind: ps.ok ? ps.kind : null, sizeValue: ps.ok ? ps.value : null, sizeUnit: ps.ok ? ps.unit : null,
      packCount: ps.ok && ps.isPack ? ps.packCount : null, packExpression: ps.ok && ps.isPack ? ps.expression : null,
    };
    for (const [k, v] of Object.entries(derived)) {
      if (!same((current as Record<string, unknown>)[k], v)) data[k] = v;
    }
  }
  if (typeof data.urlKey === "string") data.urlKey = slugify(data.urlKey as string) || data.urlKey;
  if (!changes.length) return [];
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: data as Prisma.ProductUncheckedUpdateInput });
    await audit(tx, changes.map((c) => ({
      entityType: "Product", entityId: productId, productId, actorId: actor?.id, action: "UPDATE",
      field: c.field, oldValue: c.old, newValue: c.new, source: opts.source ?? "UI", reason: opts.reason,
    })));
  });
  if (!opts.skipRecompute) await recompute(productId);
  return changes.map((c) => c.field);
}

export async function setAttributeValue(
  productId: string, attributeId: string, locale: string, raw: unknown, actor: SessionUser | null, source: AuditSource = "UI",
) {
  const attr = await db.attributeDefinition.findUniqueOrThrow({ where: { id: attributeId } });
  const existing = await db.productAttributeValue.findUnique({ where: { productId_attributeId_locale: { productId, attributeId, locale } } });
  const data: { valueText: string | null; valueNumber: number | null; valueBool: boolean | null; valueDate: Date | null; valueJson: Prisma.InputJsonValue | typeof Prisma.DbNull } = {
    valueText: null, valueNumber: null, valueBool: null, valueDate: null, valueJson: Prisma.DbNull,
  };
  const empty = raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0);
  switch (attr.type) {
    case "NUMBER": {
      if (!empty) {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new Error(`${attr.label}: "${raw}" is not a number`);
        const v = (attr.validation as { min?: number; max?: number } | null) ?? {};
        if (v.min != null && n < v.min) throw new Error(`${attr.label} must be ≥ ${v.min}`);
        if (v.max != null && n > v.max) throw new Error(`${attr.label} must be ≤ ${v.max}`);
        data.valueNumber = n;
      }
      break;
    }
    case "BOOLEAN": data.valueBool = empty ? null : raw === true || raw === "true" || raw === "on"; break;
    case "DATE": data.valueDate = empty ? null : new Date(String(raw)); break;
    case "MULTISELECT": {
      const arr = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const allowed = ((attr.options as { value: string }[] | null) ?? []).map((o) => o.value);
      const bad = arr.filter((a) => allowed.length && !allowed.includes(a));
      if (bad.length) throw new Error(`${attr.label}: invalid option(s) ${bad.join(", ")}`);
      data.valueJson = arr.length ? arr : Prisma.DbNull;
      break;
    }
    case "DROPDOWN": {
      if (!empty) {
        const allowed = ((attr.options as { value: string }[] | null) ?? []).map((o) => o.value);
        if (allowed.length && !allowed.includes(String(raw))) throw new Error(`${attr.label}: "${raw}" is not an allowed option`);
        data.valueText = String(raw);
      }
      break;
    }
    default: {
      if (!empty) {
        const s = String(raw).trim();
        const v = (attr.validation as { maxLength?: number } | null) ?? {};
        if (v.maxLength && s.length > v.maxLength) throw new Error(`${attr.label} is longer than ${v.maxLength} characters`);
        data.valueText = s;
      }
    }
  }
  const oldVal = existing ? existing.valueText ?? existing.valueNumber ?? existing.valueBool ?? existing.valueDate ?? existing.valueJson : null;
  const newVal = data.valueText ?? data.valueNumber ?? data.valueBool ?? data.valueDate ?? (Array.isArray(data.valueJson) ? data.valueJson : null);
  if (JSON.stringify(oldVal ?? null) === JSON.stringify(newVal ?? null)) return false;
  await db.$transaction(async (tx) => {
    if (empty) await tx.productAttributeValue.deleteMany({ where: { productId, attributeId, locale } });
    else await tx.productAttributeValue.upsert({
      where: { productId_attributeId_locale: { productId, attributeId, locale } },
      create: { productId, attributeId, locale, ...data },
      update: data,
    });
    await audit(tx, { entityType: "Product", entityId: productId, productId, actorId: actor?.id, action: "UPDATE",
      field: `attr:${attr.code}${locale !== "all" ? `:${locale}` : ""}`, oldValue: oldVal, newValue: newVal, source });
  });
  return true;
}

/* ------------------------------------------------------------ workflow */

export async function transitionProduct(productId: string, to: WorkflowStatus, actor: SessionUser, reason?: string | null, source: AuditSource = "WORKFLOW") {
  const p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
  const [rules, ev] = await Promise.all([loadTransitions(), evaluate(p)]);
  const res = evaluateTransition(to, {
    role: actor.role, status: p.status as WorkflowStatus, previousStatus: (p.previousStatus as WorkflowStatus | null) ?? null,
    reason, checks: ev.checks, details: ev.details,
  }, rules);
  if (!res.allowed) return { ok: false as const, errors: res.errors };
  const now = new Date();
  const data: Prisma.ProductUncheckedUpdateInput = {
    status: to as DbStatus,
    previousStatus: to === "BLOCKED" ? p.status : p.previousStatus,
    statusChangedAt: now,
  };
  if (to === "MAGENTO_LINKED") data.magentoLinkedAt = now;
  if (to === "LIVE") { data.liveAt = now; data.productOnline = true; }
  if (to === "COMPLETED") data.completedAt = now;
  if (to === "QC_IN_PROGRESS" && !p.qcReviewerId) data.qcReviewerId = actor.id;
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data });
    await audit(tx, {
      entityType: "Product", entityId: productId, productId, actorId: actor.id, action: "STATUS_CHANGE", field: "status",
      oldValue: p.status, newValue: to, source, reason: reason ?? res.rule?.label,
    });
  });
  return { ok: true as const, errors: [], message: `${p.sku}: ${STATUS_LABELS[p.status as WorkflowStatus]} → ${STATUS_LABELS[to]}` };
}

export function overallQc(outcomes: (string | null)[]) {
  return worst(outcomes.filter(Boolean) as ("PASS" | "WARNING" | "ERROR" | "NEEDS_REVIEW")[]);
}
