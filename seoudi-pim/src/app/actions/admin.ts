"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, QcOutcome, Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { hashPassword, requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { loadCompletenessRules, loadQcRules, recompute } from "@/lib/server/products";
import { ROLES } from "@/lib/domain/rbac";
import { VALIDATIONS } from "@/lib/domain/workflow";
import { STAGES } from "@/lib/domain/completeness";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });

const userSchema = z.object({
  email: z.string().email(), name: z.string().min(2), role: z.enum(ROLES), password: z.string().min(10, "Password must be at least 10 characters"),
});

export async function createUserAction(input: z.input<typeof userSchema>): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users.manage");
    const p = userSchema.safeParse(input);
    if (!p.success) return { ok: false, errors: p.error.issues.map((i) => i.message) };
    const email = p.data.email.toLowerCase();
    if (await db.user.findUnique({ where: { email } })) return { ok: false, errors: ["Email already exists"] };
    const u = await db.user.create({ data: { email, name: p.data.name, role: p.data.role, passwordHash: await hashPassword(p.data.password) } });
    await audit(db, { entityType: "User", entityId: u.id, actorId: admin.id, action: "CREATE", newValue: `${email} (${p.data.role})` });
    revalidatePath("/users");
    return { ok: true, message: `User ${email} created` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(id: string, data: { role?: Role; active?: boolean; name?: string; password?: string }): Promise<ActionResult> {
  try {
    const admin = await requirePermission("users.manage");
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    if (id === admin.id && (data.active === false || (data.role && data.role !== "ADMIN"))) return { ok: false, errors: ["You cannot demote or deactivate yourself"] };
    if (data.role && !ROLES.includes(data.role)) return { ok: false, errors: ["Unknown role"] };
    const patch: Prisma.UserUpdateInput = {};
    if (data.role && data.role !== u.role) patch.role = data.role;
    if (data.active !== undefined && data.active !== u.active) patch.active = data.active;
    if (data.name && data.name !== u.name) patch.name = data.name;
    if (data.password) {
      if (data.password.length < 10) return { ok: false, errors: ["Password must be at least 10 characters"] };
      patch.passwordHash = await hashPassword(data.password);
    }
    await db.user.update({ where: { id }, data: patch });
    if (patch.active === false || patch.passwordHash || patch.role) await db.session.deleteMany({ where: { userId: id } });
    await audit(db, Object.keys(patch).map((k) => ({ entityType: "User", entityId: id, actorId: admin.id, action: "UPDATE", field: k,
      oldValue: k === "passwordHash" ? "***" : (u as Record<string, unknown>)[k], newValue: k === "passwordHash" ? "***" : (patch as Record<string, unknown>)[k] })));
    revalidatePath("/users");
    return { ok: true, message: "User updated" };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTransitionAction(id: string, data: { active?: boolean; allowedRoles?: Role[]; validations?: string[]; reasonRequired?: boolean }): Promise<ActionResult> {
  try {
    const admin = await requirePermission("settings.manage");
    const bad = (data.validations ?? []).filter((v) => !(v in VALIDATIONS));
    if (bad.length) return { ok: false, errors: [`Unknown validation(s): ${bad.join(", ")}`] };
    const before = await db.workflowTransitionRule.findUniqueOrThrow({ where: { id } });
    await db.workflowTransitionRule.update({ where: { id }, data });
    await audit(db, { entityType: "WorkflowTransitionRule", entityId: id, actorId: admin.id, action: "UPDATE", field: `${before.fromStatus}→${before.toStatus}`,
      oldValue: JSON.stringify({ active: before.active, roles: before.allowedRoles, validations: before.validations, reason: before.reasonRequired }), newValue: JSON.stringify(data) });
    revalidatePath("/settings");
    return { ok: true, message: "Transition rule saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function updateQcRuleAction(id: string, data: { active?: boolean; severity?: QcOutcome; config?: string }): Promise<ActionResult> {
  try {
    const admin = await requirePermission("settings.manage");
    let config: Prisma.InputJsonValue | undefined;
    if (data.config != null) {
      try { config = data.config.trim() ? JSON.parse(data.config) : {}; } catch { return { ok: false, errors: ["Config must be valid JSON"] }; }
    }
    const before = await db.qcRule.findUniqueOrThrow({ where: { id } });
    await db.qcRule.update({ where: { id }, data: { active: data.active, severity: data.severity, ...(config !== undefined ? { config } : {}) } });
    await audit(db, { entityType: "QcRule", entityId: id, actorId: admin.id, action: "UPDATE", field: before.code,
      oldValue: JSON.stringify({ active: before.active, severity: before.severity, config: before.config }), newValue: JSON.stringify({ active: data.active, severity: data.severity, config }) });
    revalidatePath("/settings");
    return { ok: true, message: "QC rule saved – use “Recalculate all” to re-evaluate products" };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCompletenessRuleAction(input: { id?: string; stage: string; fieldKey: string; label: string; categoryId?: string | null; active?: boolean; remove?: boolean }): Promise<ActionResult> {
  try {
    const admin = await requirePermission("settings.manage");
    if (input.remove && input.id) {
      await db.completenessRule.delete({ where: { id: input.id } });
      await audit(db, { entityType: "CompletenessRule", entityId: input.id, actorId: admin.id, action: "DELETE", oldValue: `${input.stage}:${input.fieldKey}` });
    } else {
      if (!(STAGES as readonly string[]).includes(input.stage)) return { ok: false, errors: ["Unknown stage"] };
      if (!input.fieldKey || !input.label) return { ok: false, errors: ["Field and label are required"] };
      const data = { stage: input.stage, fieldKey: input.fieldKey, label: input.label, categoryId: input.categoryId || null, active: input.active ?? true };
      const r = input.id ? await db.completenessRule.update({ where: { id: input.id }, data }) : await db.completenessRule.create({ data });
      await audit(db, { entityType: "CompletenessRule", entityId: r.id, actorId: admin.id, action: input.id ? "UPDATE" : "CREATE", newValue: `${data.stage}:${data.fieldKey} active=${data.active}` });
    }
    revalidatePath("/settings");
    return { ok: true, message: "Completeness rules saved – use “Recalculate all”" };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSettingAction(key: string, value: string): Promise<ActionResult> {
  try {
    const admin = await requirePermission("settings.manage");
    let v: Prisma.InputJsonValue;
    try { v = JSON.parse(value); } catch { v = value; }
    const before = await db.setting.findUnique({ where: { key } });
    await db.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
    await audit(db, { entityType: "Setting", entityId: key, actorId: admin.id, action: "UPDATE", field: key, oldValue: before?.value, newValue: v });
    revalidatePath("/settings");
    return { ok: true, message: `Saved ${key}` };
  } catch (e) {
    return fail(e);
  }
}

export async function recalculateAllAction(): Promise<ActionResult> {
  try {
    const admin = await requirePermission("settings.manage");
    const cache = { completeness: await loadCompletenessRules(), qc: await loadQcRules() };
    const ids = await db.product.findMany({ select: { id: true } });
    for (const { id } of ids) await recompute(id, cache);
    await audit(db, { entityType: "System", entityId: "recompute", actorId: admin.id, action: "RECALCULATE", newValue: `${ids.length} products`, source: "SYSTEM" });
    revalidatePath("/", "layout");
    return { ok: true, message: `Recalculated completeness & QC for ${ids.length} products` };
  } catch (e) {
    return fail(e);
  }
}
