"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { evaluate, productInclude, recompute, transitionProduct, updateProduct } from "@/lib/server/products";
import { QC_CHECKLIST, type QcOutcome } from "@/lib/domain/qc";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });

export async function startQcAction(productId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("qc.review");
    const r = await transitionProduct(productId, "QC_IN_PROGRESS", user, "QC started", "QC");
    revalidatePath(`/qc/${productId}`);
    return r.ok ? { ok: true, message: "QC started" } : { ok: false, errors: r.errors };
  } catch (e) {
    return fail(e);
  }
}

export async function qcDecisionAction(input: {
  productId: string;
  decision: "APPROVE" | "REJECT" | "REQUEST_EDIT";
  checklist: Record<string, boolean>;
  notes?: string;
  assignTo?: string | null;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission("qc.review");
    const { productId, decision, checklist } = input;
    const notes = input.notes?.trim() || null;
    let p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
    if (p.status === "READY_FOR_QC") {
      const s = await transitionProduct(productId, "QC_IN_PROGRESS", user, "QC started", "QC");
      if (!s.ok) return { ok: false, errors: s.errors };
      p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
    }
    if (decision === "APPROVE") {
      const unchecked = QC_CHECKLIST.filter((c) => !checklist[c.code]).map((c) => c.label);
      if (unchecked.length) return { ok: false, errors: ["Complete the checklist before approving:", ...unchecked] };
    } else if (!notes || notes.length < 5) {
      return { ok: false, errors: ["Give precise feedback (at least a sentence) when rejecting or requesting edits"] };
    }
    const target = decision === "APPROVE" ? "QC_APPROVED" : decision === "REJECT" ? "QC_REJECTED" : "NEEDS_EDIT";
    const ev = await evaluate(p);
    const r = await transitionProduct(productId, target, user, notes ?? "QC approved", "QC");
    if (!r.ok) return { ok: false, errors: r.errors };
    const outcome: QcOutcome = decision === "APPROVE" ? (ev.qc.outcome === "ERROR" ? "NEEDS_REVIEW" : ev.qc.outcome) : "ERROR";
    await db.qcReview.create({
      data: {
        productId, reviewerId: user.id, decision: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "NEEDS_EDIT",
        outcome, score: ev.qc.score, checklist, ruleResults: ev.qc.issues as never, notes,
      },
    });
    if (notes && decision !== "APPROVE") {
      await db.comment.create({ data: { productId, authorId: user.id, body: `QC ${decision === "REJECT" ? "rejected" : "requested edits"}: ${notes}` } });
    }
    if (input.assignTo) await updateProduct(productId, { ownerId: input.assignTo }, user, { source: "QC", reason: "Assigned back by QC", skipPermission: true });
    revalidatePath("/qc");
    revalidatePath(`/qc/${productId}`);
    return { ok: true, message: r.message };
  } catch (e) {
    return fail(e);
  }
}

export async function flagFieldAction(productId: string, fieldKey: string, message: string, severity: QcOutcome, suspected: boolean): Promise<ActionResult> {
  try {
    const user = await requirePermission("qc.review");
    if (!fieldKey || message.trim().length < 3) return { ok: false, errors: ["Choose a field and describe the problem"] };
    const flag = await db.qcFlag.create({ data: { productId, fieldKey, message: message.trim(), severity, suspected, createdById: user.id } });
    await db.comment.create({ data: { productId, fieldKey, authorId: user.id, body: `${suspected ? "[Suspected] " : ""}${message.trim()}` } });
    await audit(db, { entityType: "QcFlag", entityId: flag.id, productId, actorId: user.id, action: suspected ? "QC_SUSPECT" : "QC_FLAG", field: fieldKey, newValue: message.trim(), source: "QC" });
    await recompute(productId);
    revalidatePath(`/qc/${productId}`);
    return { ok: true, message: `Flagged ${fieldKey}` };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveFlagAction(flagId: string, resolved: boolean): Promise<ActionResult> {
  try {
    const user = await requirePermission("comment.resolve");
    const f = await db.qcFlag.update({ where: { id: flagId }, data: { resolved, resolvedAt: resolved ? new Date() : null } });
    await audit(db, { entityType: "QcFlag", entityId: f.id, productId: f.productId, actorId: user.id, action: resolved ? "QC_FLAG_RESOLVED" : "QC_FLAG_REOPENED", field: f.fieldKey, source: "QC" });
    revalidatePath(`/qc/${f.productId}`);
    revalidatePath(`/products/${f.productId}`);
    return { ok: true, message: resolved ? "Flag resolved (kept in history)" : "Flag reopened" };
  } catch (e) {
    return fail(e);
  }
}
