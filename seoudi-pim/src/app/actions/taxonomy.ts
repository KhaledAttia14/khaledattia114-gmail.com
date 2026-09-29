"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/server/db";
import { requirePermission } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import type { ActionResult } from "./products";

const fail = (e: unknown): ActionResult => ({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });

function cleanName(n: string): string {
  return n.replace(/\//g, "-").replace(/\s+/g, " ").trim();
}

export async function createCategoryAction(parentId: string | null, name: string, nameAr?: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("taxonomy.manage");
    const n = cleanName(name);
    if (!n) return { ok: false, errors: ["Name is required"] };
    const parent = parentId ? await db.category.findUniqueOrThrow({ where: { id: parentId } }) : null;
    const path = parent ? `${parent.path}/${n}` : n;
    if (await db.category.findUnique({ where: { path } })) return { ok: false, errors: [`"${path}" already exists`] };
    const c = await db.category.create({ data: { name: n, nameAr: nameAr?.trim() || null, parentId, path, depth: parent ? parent.depth + 1 : 0 } });
    await audit(db, { entityType: "Category", entityId: c.id, actorId: user.id, action: "CREATE", newValue: path });
    revalidatePath("/categories");
    return { ok: true, message: `Created ${path}` };
  } catch (e) {
    return fail(e);
  }
}

/** Recompute path/depth for a node and all descendants. */
async function rebuildPaths(id: string, newParentPath: string | null, depth: number) {
  const node = await db.category.findUniqueOrThrow({ where: { id } });
  const path = newParentPath ? `${newParentPath}/${node.name}` : node.name;
  await db.category.update({ where: { id }, data: { path, depth } });
  const children = await db.category.findMany({ where: { parentId: id }, select: { id: true } });
  for (const ch of children) await rebuildPaths(ch.id, path, depth + 1);
}

export async function updateCategoryAction(id: string, data: { name?: string; nameAr?: string | null; magentoId?: string | null; attributeSetId?: string | null; sortOrder?: string | null }): Promise<ActionResult> {
  try {
    const user = await requirePermission("taxonomy.manage");
    const c = await db.category.findUniqueOrThrow({ where: { id } });
    const entries: { field: string; old: unknown; new: unknown }[] = [];
    const patch: Record<string, unknown> = {};
    if (data.name != null && cleanName(data.name) !== c.name) {
      const n = cleanName(data.name);
      const parentPath = c.parentId ? (await db.category.findUniqueOrThrow({ where: { id: c.parentId } })).path : null;
      const newPath = parentPath ? `${parentPath}/${n}` : n;
      if (await db.category.findUnique({ where: { path: newPath } })) return { ok: false, errors: [`"${newPath}" already exists`] };
      patch.name = n;
      entries.push({ field: "name", old: c.name, new: n });
    }
    if (data.nameAr !== undefined && (data.nameAr || null) !== c.nameAr) { patch.nameAr = data.nameAr || null; entries.push({ field: "nameAr", old: c.nameAr, new: data.nameAr }); }
    if (data.magentoId !== undefined) {
      const m = data.magentoId ? Number(data.magentoId) : null;
      if (m != null && (!Number.isInteger(m) || m <= 0)) return { ok: false, errors: ["Magento ID must be a positive integer"] };
      if (m !== c.magentoId) { patch.magentoId = m; entries.push({ field: "magentoId", old: c.magentoId, new: m }); }
    }
    if (data.attributeSetId !== undefined && (data.attributeSetId || null) !== c.attributeSetId) {
      patch.attributeSetId = data.attributeSetId || null; entries.push({ field: "attributeSetId", old: c.attributeSetId, new: data.attributeSetId });
    }
    if (data.sortOrder != null && Number(data.sortOrder) !== c.sortOrder) { patch.sortOrder = Number(data.sortOrder) || 0; entries.push({ field: "sortOrder", old: c.sortOrder, new: data.sortOrder }); }
    if (!entries.length) return { ok: true, message: "No changes" };
    await db.category.update({ where: { id }, data: patch });
    if (patch.name) {
      const parentPath = c.parentId ? (await db.category.findUniqueOrThrow({ where: { id: c.parentId } })).path : null;
      await rebuildPaths(id, parentPath, c.depth);
    }
    await audit(db, entries.map((e) => ({ entityType: "Category", entityId: id, actorId: user.id, action: e.field === "name" ? "RENAME" : "UPDATE", field: e.field, oldValue: e.old, newValue: e.new })));
    revalidatePath("/categories");
    return { ok: true, message: "Category saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCategoryAction(id: string, newParentId: string | null): Promise<ActionResult> {
  try {
    const user = await requirePermission("taxonomy.manage");
    const c = await db.category.findUniqueOrThrow({ where: { id } });
    if (newParentId === id) return { ok: false, errors: ["A category cannot be its own parent"] };
    const parent = newParentId ? await db.category.findUniqueOrThrow({ where: { id: newParentId } }) : null;
    if (parent && (parent.path === c.path || parent.path.startsWith(c.path + "/"))) return { ok: false, errors: ["Cannot move a category under its own descendant"] };
    const newPath = parent ? `${parent.path}/${c.name}` : c.name;
    if (newPath !== c.path && (await db.category.findUnique({ where: { path: newPath } }))) return { ok: false, errors: [`"${newPath}" already exists`] };
    const oldPath = c.path;
    await db.category.update({ where: { id }, data: { parentId: newParentId } });
    await rebuildPaths(id, parent?.path ?? null, parent ? parent.depth + 1 : 0);
    await audit(db, { entityType: "Category", entityId: id, actorId: user.id, action: "MOVE", field: "path", oldValue: oldPath, newValue: newPath });
    revalidatePath("/categories");
    return { ok: true, message: `Moved to ${newPath}` };
  } catch (e) {
    return fail(e);
  }
}

export async function setCategoryActiveAction(id: string, active: boolean, reason?: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("taxonomy.manage");
    const c = await db.category.findUniqueOrThrow({ where: { id } });
    const ids = active ? [id] : (await db.category.findMany({ where: { OR: [{ id }, { path: { startsWith: c.path + "/" } }] }, select: { id: true } })).map((x) => x.id);
    await db.category.updateMany({ where: { id: { in: ids } }, data: { active } });
    await audit(db, { entityType: "Category", entityId: id, actorId: user.id, action: active ? "REACTIVATE" : "DEACTIVATE", field: "active", oldValue: c.active, newValue: active, reason });
    revalidatePath("/categories");
    return { ok: true, message: active ? "Reactivated" : `Deactivated ${ids.length} node(s) – products keep their assignment` };
  } catch (e) {
    return fail(e);
  }
}
