import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can } from "@/lib/domain/rbac";
import { buildWhere, parseFilters } from "@/lib/server/product-query";
import { buildExport, loadProfile } from "@/lib/server/exports";
import { EXPORT_SOURCES, type ExportColumn } from "@/lib/domain/magento";
import { PageHeader } from "@/components/pim/page-header";
import { ExportsClient } from "./exports-client";

export const metadata = { title: "Exports" };

export default async function ExportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const profiles = await db.exportProfile.findMany({ orderBy: { code: "asc" } });
  const code = sp.profile ?? profiles[0]?.code;
  const profile = code ? await loadProfile(code) : null;
  const filterSp = { ...sp, status: sp.status ?? "QC_APPROVED,READY_FOR_MAGENTO" };
  const where = await buildWhere(parseFilters(filterSp), user.id);
  const [preview, total, categories, recent] = await Promise.all([
    profile ? buildExport(profile, where) : null,
    db.product.count({ where }),
    db.category.findMany({ where: { active: true }, select: { id: true, path: true }, orderBy: { path: "asc" } }),
    db.auditLog.findMany({ where: { action: "EXPORT" }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const query = new URLSearchParams(Object.entries(filterSp).filter(([k, v]) => v && k !== "profile") as [string, string][]).toString();
  return (
    <div>
      <PageHeader title="Exports" description="Configurable Magento exports derived from the Creation.xlsx layouts: default/English, ar_EG/Arabic and category assignment. Warnings never block – nothing is auto-fixed or deleted." />
      <ExportsClient
        profiles={profiles.map((p) => ({ id: p.id, code: p.code, name: p.name, kind: p.kind as "PRODUCT" | "CATEGORY", storeViewCode: p.storeViewCode, locale: p.locale as "en" | "ar",
          columns: p.columns as unknown as ExportColumn[], categorySeparator: (p.options as { categorySeparator?: string } | null)?.categorySeparator ?? "|", active: p.active }))}
        selected={code ?? null}
        filters={{ status: filterSp.status ?? "", category: sp.category ?? "", q: sp.q ?? "" }}
        query={query}
        total={total}
        preview={preview ? { headers: preview.headers, rows: preview.rows.slice(0, 25), warnings: preview.warnings.slice(0, 50), warningCount: preview.warnings.length } : null}
        categories={categories}
        sources={EXPORT_SOURCES}
        recent={recent.map((r) => ({ id: r.id, profile: r.entityId, rows: r.newValue, warnings: r.reason, actor: r.actor?.name ?? "—", createdAt: r.createdAt }))}
        perms={{ export: can(user.role, "export.run"), configure: can(user.role, "settings.manage"), record: can(user.role, "product.editMagento") }}
      />
    </div>
  );
}
