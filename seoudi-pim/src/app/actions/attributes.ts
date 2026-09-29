"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AttributeType, Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });
const TYPES: AttributeType[] = ["TEXT", "NUMBER", "DROPDOWN", "MULTISELECT", "BOOLEAN", "DATE"];

const attrSchema = z.object({
  id: z.string().optional(),
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "code: lower-case letters, digits and underscores"),
  label: z.string().min(1),
  labelAr: z.string().optional(),
  type: z.enum(TYPES as [AttributeType, ...AttributeType[]]),
  options: z.string().optional(), // one per line: value|label
  unit: z.string().optional(),
  localized: z.boolean().default(false),
  group: z.string().default("Specifications"),
  magentoCode: z.string().optional(),
  helpText: z.string().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  maxLength: z.string().optional(),
  active: z.boolean().default(true),
});

export async function saveAttributeAction(input: z.input<typeof attrSchema>): Promise<ActionResult> {
  try {
    const user = await requirePermission("attributes.manage");
    const parsed = attrSchema.safeParse(input);
    if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
    const d = parsed.data;
    const options = ["DROPDOWN", "MULTISELECT"].includes(d.type)
      ? (d.options ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [value, label] = l.split("|"); return { value: value.trim(), label: (label ?? value).trim() }; })
      : null;
    if (options && !options.length) return { ok: false, errors: ["Dropdown / multi-select attributes need at least one option"] };
    const validation: Record<string, number> = {};
    if (d.min) validation.min = Number(d.min);
    if (d.max) validation.max = Number(d.max);
    if (d.maxLength) validation.maxLength = Number(d.maxLength);
    const data = {
      code: d.code, label: d.label, labelAr: d.labelAr || null, type: d.type, unit: d.unit || null, localized: d.localized, group: d.group || "Specifications",
      magentoCode: d.magentoCode || null, helpText: d.helpText || null, active: d.active,
      options: (options ?? undefined) as Prisma.InputJsonValue | undefined,
      validation: Object.keys(validation).length ? validation : undefined,
    };
    if (d.id) {
      const before = await db.attributeDefinition.findUniqueOrThrow({ where: { id: d.id } });
      if (before.type !== d.type && (await db.productAttributeValue.count({ where: { attributeId: d.id } })) > 0) {
        return { ok: false, errors: ["Type cannot change while products have values for this attribute"] };
      }
      await db.attributeDefinition.update({ where: { id: d.id }, data });
      await audit(db, { entityType: "AttributeDefinition", entityId: d.id, actorId: user.id, action: "UPDATE", oldValue: JSON.stringify({ label: before.label, type: before.type, active: before.active }), newValue: JSON.stringify({ label: d.label, type: d.type, active: d.active }) });
    } else {
      if (await db.attributeDefinition.findUnique({ where: { code: d.code } })) return { ok: false, errors: [`Code "${d.code}" already exists`] };
      const a = await db.attributeDefinition.create({ data });
      await audit(db, { entityType: "AttributeDefinition", entityId: a.id, actorId: user.id, action: "CREATE", newValue: d.code });
    }
    revalidatePath("/attributes");
    return { ok: true, message: "Attribute saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function createAttributeSetAction(code: string, name: string, magentoCode: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("attributes.manage");
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) return { ok: false, errors: ["Set code: UPPER_CASE letters/digits/underscores"] };
    const s = await db.attributeSet.create({ data: { code, name: name || code, magentoCode: magentoCode || "Default" } });
    await audit(db, { entityType: "AttributeSet", entityId: s.id, actorId: user.id, action: "CREATE", newValue: code });
    revalidatePath("/attributes");
    return { ok: true, message: "Attribute set created" };
  } catch (e) {
    return fail(e);
  }
}

export async function setAttributeSetItemAction(attributeSetId: string, attributeId: string, mode: "required" | "optional" | "remove"): Promise<ActionResult> {
  try {
    const user = await requirePermission("attributes.manage");
    if (mode === "remove") await db.attributeSetItem.deleteMany({ where: { attributeSetId, attributeId } });
    else await db.attributeSetItem.upsert({
      where: { attributeSetId_attributeId: { attributeSetId, attributeId } },
      create: { attributeSetId, attributeId, required: mode === "required" },
      update: { required: mode === "required" },
    });
    await audit(db, { entityType: "AttributeSet", entityId: attributeSetId, actorId: user.id, action: "UPDATE", field: attributeId, newValue: mode });
    revalidatePath("/attributes");
    return { ok: true, message: "Attribute set updated – completeness recalculates on next product change or via Settings › Recalculate" };
  } catch (e) {
    return fail(e);
  }
}

export async function setCategoryAttributeAction(categoryId: string, attributeId: string, mode: "required" | "optional" | "remove"): Promise<ActionResult> {
  try {
    const user = await requirePermission("attributes.manage");
    if (mode === "remove") await db.categoryAttribute.deleteMany({ where: { categoryId, attributeId } });
    else await db.categoryAttribute.upsert({
      where: { categoryId_attributeId: { categoryId, attributeId } },
      create: { categoryId, attributeId, required: mode === "required" },
      update: { required: mode === "required" },
    });
    await audit(db, { entityType: "Category", entityId: categoryId, actorId: user.id, action: "ATTRIBUTE_RULE", field: attributeId, newValue: mode });
    revalidatePath("/attributes");
    return { ok: true, message: "Category attribute rule saved" };
  } catch (e) {
    return fail(e);
  }
}
