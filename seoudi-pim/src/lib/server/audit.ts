import type { AuditSource, Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

export interface AuditEntry {
  entityType: string;
  entityId: string;
  productId?: string | null;
  actorId?: string | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  source?: AuditSource;
  reason?: string | null;
}

export function auditValue(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function audit(tx: Tx, entries: AuditEntry | AuditEntry[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  await tx.auditLog.createMany({
    data: list.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      productId: e.productId ?? null,
      actorId: e.actorId ?? null,
      action: e.action,
      field: e.field ?? null,
      oldValue: auditValue(e.oldValue)?.slice(0, 4000) ?? null,
      newValue: auditValue(e.newValue)?.slice(0, 4000) ?? null,
      source: e.source ?? "UI",
      reason: e.reason ?? null,
    })),
  });
}
