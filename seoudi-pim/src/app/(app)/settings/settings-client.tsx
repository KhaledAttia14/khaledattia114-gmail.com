"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MultiFilter } from "@/components/pim/multi-filter";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { recalculateAllAction, saveCompletenessRuleAction, saveSettingAction, updateQcRuleAction, updateTransitionAction } from "@/app/actions/admin";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain/rbac";
import { STATUS_LABELS, VALIDATIONS, type WorkflowStatus } from "@/lib/domain/workflow";
import { STAGES, STAGE_LABELS } from "@/lib/domain/completeness";
import { fieldLabel } from "@/lib/labels";

interface Props {
  transitions: { id: string; fromStatus: string; toStatus: string; label: string; allowedRoles: string[]; validations: string[]; reasonRequired: boolean; active: boolean }[];
  qcRules: { id: string; code: string; name: string; description: string | null; severity: string; active: boolean; config: string }[];
  completeness: { id: string; stage: string; fieldKey: string; label: string; categoryId: string | null; active: boolean }[];
  settings: { key: string; value: string }[];
  categories: { id: string; path: string }[];
}

const statusLabel = (s: string) => (s === "*" ? "Any active status" : s === "@previous" ? "Previous status" : STATUS_LABELS[s as WorkflowStatus] ?? s);
const COMPLETENESS_FIELDS = ["sku", "rmsName", "barcode", "brandId", "primaryCategoryId", "productType", "nameEn", "nameAr", "descriptionEn", "descriptionAr",
  "shortDescriptionEn", "shortDescriptionAr", "volumeWeightEn", "volumeWeightAr", "image:main", "urlKey", "metaTitleEn", "metaTitleAr", "metaDescriptionEn",
  "metaDescriptionAr", "visibility", "weightKg", "origin", "model", "color", "flavor", "variant", "dimensions"];

export function SettingsClient(p: Props) {
  const { pending, result, run } = useAction();
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recalculateAllAction())}><RefreshCw />{pending ? "Recalculating…" : "Recalculate completeness & QC for all products"}</Button>
        <Feedback result={result} />
      </div>
      <Tabs defaultValue="workflow">
        <TabsList className="bg-card">
          <TabsTrigger value="workflow">Workflow transitions</TabsTrigger>
          <TabsTrigger value="qc">QC rules</TabsTrigger>
          <TabsTrigger value="completeness">Completeness rules</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>
        <TabsContent value="workflow" className="pt-3">
          <Card>
            <CardHeader title="Allowed transitions" actions={<span className="text-[11px] text-muted-foreground">No other stage jumps are possible. Validations are checked on every move.</span>} />
            <Table>
              <THead><tr><TH>From</TH><TH>To</TH><TH>Label</TH><TH>Allowed roles</TH><TH>Validations</TH><TH>Reason</TH><TH>Active</TH></tr></THead>
              <TBody>{p.transitions.map((t) => <TransitionRow key={t.id} t={t} />)}</TBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="qc" className="pt-3">
          <Card>
            <CardHeader title="Automated QC rules" actions={<span className="text-[11px] text-muted-foreground">Outcomes: PASS · WARNING · ERROR · NEEDS_REVIEW. Parameters are JSON.</span>} />
            <Table>
              <THead><tr><TH>Rule</TH><TH>Description</TH><TH>Severity</TH><TH>Parameters (JSON)</TH><TH>Active</TH></tr></THead>
              <TBody>{p.qcRules.map((r) => <QcRow key={r.id} r={r} />)}</TBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="completeness" className="pt-3">
          <CompletenessRules rules={p.completeness} categories={p.categories} />
        </TabsContent>
        <TabsContent value="general" className="pt-3">
          <Card>
            <CardHeader title="System settings (JSON values)" />
            <Table><TBody>{p.settings.map((s) => <SettingRow key={s.key} s={s} />)}</TBody></Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransitionRow({ t }: { t: Props["transitions"][number] }) {
  const { pending, result, run } = useAction();
  return (
    <TR className={t.active ? "" : "opacity-50"}>
      <TD className="whitespace-nowrap">{statusLabel(t.fromStatus)}</TD>
      <TD className="whitespace-nowrap">→ {statusLabel(t.toStatus)}</TD>
      <TD>{t.label}{result && !result.ok && <Feedback result={result} />}</TD>
      <TD><MultiFilter label={`${t.allowedRoles.length} role(s)`} value={t.allowedRoles} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        onChange={(v) => run(() => updateTransitionAction(t.id, { allowedRoles: v as Role[] }))} />
        <div className="mt-0.5 text-[10px] text-muted-foreground">{t.allowedRoles.map((r) => ROLE_LABELS[r as Role]).join(", ")}</div></TD>
      <TD><MultiFilter label={`${t.validations.length} check(s)`} value={t.validations} options={Object.entries(VALIDATIONS).map(([k, l]) => ({ value: k, label: l }))}
        onChange={(v) => run(() => updateTransitionAction(t.id, { validations: v }))} />
        <div className="mt-0.5 max-w-64 text-[10px] text-muted-foreground">{t.validations.join(", ")}</div></TD>
      <TD><input type="checkbox" disabled={pending} checked={t.reasonRequired} onChange={(e) => run(() => updateTransitionAction(t.id, { reasonRequired: e.target.checked }))} aria-label="Reason required" /></TD>
      <TD><input type="checkbox" disabled={pending} checked={t.active} onChange={(e) => run(() => updateTransitionAction(t.id, { active: e.target.checked }))} aria-label="Active" /></TD>
    </TR>
  );
}

function QcRow({ r }: { r: Props["qcRules"][number] }) {
  const [config, setConfig] = useState(r.config);
  const { pending, result, run } = useAction();
  return (
    <TR className={r.active ? "" : "opacity-50"}>
      <TD className="whitespace-nowrap"><div className="font-medium">{r.name}</div><div className="font-mono text-[10px] text-muted-foreground">{r.code}</div></TD>
      <TD className="max-w-md text-[11.5px] text-muted-foreground">{r.description}</TD>
      <TD>
        <NativeSelect className="h-7 w-36 text-xs" value={r.severity} disabled={pending} onChange={(e) => run(() => updateQcRuleAction(r.id, { severity: e.target.value as never }))}>
          <option value="WARNING">WARNING</option><option value="ERROR">ERROR</option><option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
        </NativeSelect>
      </TD>
      <TD>
        <div className="flex gap-1">
          <Input className="h-7 w-72 font-mono text-[11px]" value={config} onChange={(e) => setConfig(e.target.value)} placeholder="{}" />
          {config !== r.config && <Button size="xs" disabled={pending} onClick={() => run(() => updateQcRuleAction(r.id, { config }))}>Save</Button>}
        </div>
        {result && !result.ok && <Feedback result={result} />}
      </TD>
      <TD><input type="checkbox" disabled={pending} checked={r.active} onChange={(e) => run(() => updateQcRuleAction(r.id, { active: e.target.checked }))} aria-label="Active" /></TD>
    </TR>
  );
}

function CompletenessRules({ rules, categories }: { rules: Props["completeness"]; categories: Props["categories"] }) {
  const [n, setN] = useState({ stage: "CONTENT", fieldKey: "origin", label: "", categoryId: "" });
  const { pending, result, run } = useAction();
  const cat = (id: string | null) => (id ? categories.find((c) => c.id === id)?.path ?? id : "All categories");
  return (
    <Card>
      <CardHeader title="Required fields per workflow stage (cumulative) and category" actions={<span className="text-[11px] text-muted-foreground">Attribute-set and category attribute requirements are managed in Attributes.</span>} />
      <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
        <NativeSelect className="h-7 w-32 text-xs" value={n.stage} onChange={(e) => setN({ ...n, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</NativeSelect>
        <NativeSelect className="h-7 w-48 text-xs" value={n.fieldKey} onChange={(e) => setN({ ...n, fieldKey: e.target.value })}>{COMPLETENESS_FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}</NativeSelect>
        <Input className="h-7 w-48 text-xs" placeholder="Label" value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} />
        <NativeSelect className="h-7 w-64 text-xs" value={n.categoryId} onChange={(e) => setN({ ...n, categoryId: e.target.value })}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
        </NativeSelect>
        <Button size="xs" disabled={pending} onClick={() => run(() => saveCompletenessRuleAction({ ...n, label: n.label || fieldLabel(n.fieldKey) }))}>Add requirement</Button>
        <Feedback result={result} />
      </div>
      <Table>
        <THead><tr><TH>Stage</TH><TH>Field</TH><TH>Label</TH><TH>Scope</TH><TH>Active</TH><TH /></tr></THead>
        <TBody>
          {rules.map((r) => (
            <TR key={r.id} className={r.active ? "" : "opacity-50"}>
              <TD><Badge tone="blue">{STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage}</Badge></TD>
              <TD className="font-mono text-[12px]">{r.fieldKey}</TD><TD>{r.label}</TD><TD className="text-muted-foreground">{cat(r.categoryId)}</TD>
              <TD><input type="checkbox" checked={r.active} disabled={pending} aria-label="Active" onChange={(e) => run(() => saveCompletenessRuleAction({ ...r, active: e.target.checked }))} /></TD>
              <TD><Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => saveCompletenessRuleAction({ ...r, remove: true }))}>Remove</Button></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function SettingRow({ s }: { s: Props["settings"][number] }) {
  const [v, setV] = useState(s.value);
  const { pending, result, run } = useAction();
  return (
    <TR>
      <TD className="w-48 font-mono text-[12px]">{s.key}</TD>
      <TD><Input className="h-7 font-mono text-[11px]" dir="auto" value={v} onChange={(e) => setV(e.target.value)} /></TD>
      <TD className="w-40">{v !== s.value && <Button size="xs" disabled={pending} onClick={() => run(() => saveSettingAction(s.key, v))}>Save</Button>}<Feedback result={result} /></TD>
    </TR>
  );
}
