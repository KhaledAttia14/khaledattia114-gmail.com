import { requirePagePermission } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/pim/page-header";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePagePermission("settings.manage");
  const [transitions, qcRules, completeness, settings, categories] = await Promise.all([
    db.workflowTransitionRule.findMany({ orderBy: { sortOrder: "asc" } }),
    db.qcRule.findMany({ orderBy: { sortOrder: "asc" } }),
    db.completenessRule.findMany({ orderBy: [{ stage: "asc" }, { fieldKey: "asc" }] }),
    db.setting.findMany({ orderBy: { key: "asc" } }),
    db.category.findMany({ select: { id: true, path: true }, orderBy: { path: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Settings" description="Workflow transitions & validations, QC rules, completeness requirements and system settings – all configurable without code changes." />
      <SettingsClient
        transitions={transitions.map((t) => ({ id: t.id, fromStatus: t.fromStatus, toStatus: t.toStatus, label: t.label, allowedRoles: t.allowedRoles, validations: t.validations, reasonRequired: t.reasonRequired, active: t.active }))}
        qcRules={qcRules.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, severity: r.severity, active: r.active, config: r.config ? JSON.stringify(r.config) : "" }))}
        completeness={completeness.map((c) => ({ id: c.id, stage: c.stage, fieldKey: c.fieldKey, label: c.label, categoryId: c.categoryId, active: c.active }))}
        settings={settings.map((s) => ({ key: s.key, value: JSON.stringify(s.value) }))}
        categories={categories}
      />
    </div>
  );
}
