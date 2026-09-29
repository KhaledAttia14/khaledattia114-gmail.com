"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ChevronLeft, Download, Play, ShieldCheck } from "lucide-react";
import type { BatchMeta, ImportOptions } from "@/lib/server/imports";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { runImportAction, saveMappingAction, selectSheetAction } from "@/app/actions/imports";
import { STATUS_LABELS, WORKFLOW_STATUSES } from "@/lib/domain/workflow";
import { fieldLabel } from "@/lib/labels";
import { cn, fmtDate } from "@/lib/utils";

interface Props {
  batch: { id: string; fileName: string; kind: string; status: string; sheetName: string | null; headers: string[]; totalRows: number; createdRows: number; updatedRows: number;
    skippedRows: number; errorRows: number; warningRows: number; createdBy: string; createdAt: Date; completedAt: Date | null };
  meta: BatchMeta;
  samples: unknown[][];
  rows: { id: string; rowNumber: number; sku: string | null; action: string | null; errors: string[]; warnings: string[]; diff: { field: string; current: unknown; incoming: unknown; state: string }[] }[];
  actionCounts: Record<string, number>;
  fields: { key: string; label: string; group: string }[];
  filter: string;
  canRun: boolean;
}

const STEPS = ["Upload", "Sheet", "Map columns", "Validate & preview", "Import"];
const ACTION_TONE: Record<string, Tone> = { CREATE: "green", UPDATE: "blue", UNCHANGED: "slate", CONFLICT: "amber", ERROR: "red" };
const STATE_TONE: Record<string, Tone> = { FILL: "green", APPLY: "blue", RMS_UPDATE: "violet", CONFLICT: "amber", SAME: "slate" };

function fmt(v: unknown): string {
  if (v == null || v === "") return "∅";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function ImportWizard(props: Props) {
  const { batch, meta } = props;
  const step = batch.status === "UPLOADED" ? 1 : batch.status === "MAPPED" ? 2 : batch.status === "VALIDATED" ? 3 : 4;
  return (
    <div>
      <div className="border-b bg-card px-5 py-3">
        <div className="flex items-center gap-2">
          <Link href="/imports" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Back"><ChevronLeft className="size-4" /></Link>
          <h1 className="text-base font-semibold">{batch.fileName}</h1>
          <Badge tone="blue">{batch.kind}</Badge>
          {batch.sheetName && <Badge>{batch.sheetName}</Badge>}
          <span className="text-xs text-muted-foreground">by {batch.createdBy} · {fmtDate(batch.createdAt, true)} · {batch.totalRows} data rows</span>
        </div>
        <ol className="mt-2 flex flex-wrap gap-1 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1 rounded px-2 py-0.5", i < step ? "bg-emerald-50 text-emerald-700" : i === step ? "bg-primary text-white" : "bg-slate-100 text-muted-foreground")}>
              {i < step && <CheckCircle2 className="size-3" />}{i + 1}. {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-4 p-5">
        {(batch.status === "UPLOADED" || (meta.sheets?.length ?? 0) > 1) && batch.status !== "IMPORTED" && <SheetPicker {...props} />}
        {(batch.status === "MAPPED" || batch.status === "VALIDATED") && <MappingEditor {...props} />}
        {(batch.status === "VALIDATED" || batch.status === "IMPORTED") && <Preview {...props} />}
      </div>
    </div>
  );
}

function SheetPicker({ batch, meta, canRun }: Props) {
  const [q, setQ] = useState("");
  const { pending, result, run } = useAction();
  const sheets = (meta.sheets ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card>
      <CardHeader title={`Choose a sheet (${meta.sheets?.length ?? 0} found)`} actions={<input className="h-7 w-48 rounded border px-2 text-xs" placeholder="Filter sheets…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="max-h-72 overflow-y-auto">
        <Table>
          <THead><tr><TH>Sheet</TH><TH className="text-right">Rows</TH><TH>Detected header</TH><TH /></tr></THead>
          <TBody>
            {sheets.map((s) => (
              <TR key={s.name} className={cn(s.name === batch.sheetName && "bg-accent")}>
                <TD className="whitespace-nowrap font-medium" dir="auto">{s.name}</TD>
                <TD className="tabular text-right">{s.rows}</TD>
                <TD className="max-w-[600px] truncate text-[11px] text-muted-foreground">{s.headers.join(" · ") || "—"}</TD>
                <TD>{canRun && <Button size="xs" variant={s.name === batch.sheetName ? "default" : "outline"} disabled={pending || !s.headers.some((h) => h.toLowerCase() === "sku")}
                  onClick={() => run(() => selectSheetAction(batch.id, s.name))}>{s.name === batch.sheetName ? "Reload" : "Use"}</Button>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="p-2"><Feedback result={result} /></div>
    </Card>
  );
}

function MappingEditor({ batch, meta, samples, fields, canRun }: Props) {
  const [cols, setCols] = useState<Record<number, string>>(meta.columns ?? {});
  const [opts, setOpts] = useState<ImportOptions>(meta.options ?? { mode: "FILL_EMPTY", initialStatus: "NEW_IN_RMS", createBrands: true });
  const { pending, result, run } = useAction();
  const groups = Array.from(new Set(fields.map((f) => f.group)));
  const used = Object.values(cols).filter(Boolean);
  const dupTargets = used.filter((v, i) => used.indexOf(v) !== i && !v.startsWith("auto:"));
  return (
    <Card>
      <CardHeader title="Map columns" actions={<span className="text-[11px] text-muted-foreground">“auto” targets route each cell to EN or AR by script – handles name/localized_name and duplicated columns</span>} />
      <Table>
        <THead><tr><TH>#</TH><TH>File header</TH><TH>Sample values</TH><TH className="w-72">Maps to</TH></tr></THead>
        <TBody>
          {batch.headers.map((h, i) => (
            <TR key={i} className={cn(!cols[i] && "opacity-60")}>
              <TD className="tabular text-muted-foreground">{i + 1}</TD>
              <TD className="font-mono text-[12px]">{h || <i>empty</i>}</TD>
              <TD className="max-w-[420px] truncate text-[11px] text-muted-foreground" dir="auto">{samples.map((s) => fmt(s[i])).filter((x) => x !== "∅").slice(0, 3).join("  ·  ") || "—"}</TD>
              <TD>
                <NativeSelect className={cn("h-7 text-xs", dupTargets.includes(cols[i]) && "border-red-400")} value={cols[i] ?? ""} disabled={!canRun || batch.status === "IMPORTED"}
                  onChange={(e) => setCols({ ...cols, [i]: e.target.value })}>
                  <option value="">— ignore —</option>
                  {groups.map((g) => <optgroup key={g} label={g}>{fields.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>)}
                </NativeSelect>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center gap-3 border-t p-3 text-xs">
        <label className="flex items-center gap-1">Existing SKUs:
          <NativeSelect className="h-7 w-72 text-xs" value={opts.mode} onChange={(e) => setOpts({ ...opts, mode: e.target.value as ImportOptions["mode"] })}>
            <option value="FILL_EMPTY">Safe – fill empty fields, report conflicts (recommended)</option>
            <option value="OVERWRITE">Overwrite changed fields (audited)</option>
          </NativeSelect>
        </label>
        <label className="flex items-center gap-1">New SKUs start in:
          <NativeSelect className="h-7 w-48 text-xs" value={opts.initialStatus} onChange={(e) => setOpts({ ...opts, initialStatus: e.target.value as ImportOptions["initialStatus"] })}>
            {WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={opts.createBrands} onChange={(e) => setOpts({ ...opts, createBrands: e.target.checked })} />Create missing brands</label>
        {canRun && batch.status !== "IMPORTED" && (
          <Button size="sm" disabled={pending || !Object.values(cols).includes("sku") || dupTargets.length > 0} onClick={() => run(() => saveMappingAction(batch.id, cols, opts))}>
            <ShieldCheck />{pending ? "Validating…" : "Validate & preview"}
          </Button>
        )}
        {!Object.values(cols).includes("sku") && <span className="text-red-600">Map a column to SKU</span>}
        {dupTargets.length > 0 && <span className="text-red-600">Each field can be mapped once: {dupTargets.map(fieldLabel).join(", ")}</span>}
      </div>
      <div className="px-3 pb-3"><Feedback result={result} /></div>
    </Card>
  );
}

function Preview({ batch, rows, actionCounts, filter, canRun }: Props) {
  const { pending, result, run } = useAction();
  const tabs = [["", "All"], ["CREATE", "New"], ["UPDATE", "Update"], ["CONFLICT", "Conflicts"], ["UNCHANGED", "Unchanged"], ["errors", "Errors"], ["warnings", "Warnings"]];
  const importable = (actionCounts.CREATE ?? 0) + (actionCounts.UPDATE ?? 0) + (actionCounts.CONFLICT ?? 0);
  return (
    <Card>
      <CardHeader title="Validation preview"
        actions={<div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline"><a href={`/api/imports/${batch.id}/report`}><Download />Error & conflict report</a></Button>
          <Button asChild size="sm" variant="ghost"><a href={`/api/imports/${batch.id}/report?all=1`}>Full report</a></Button>
          {canRun && batch.status === "VALIDATED" && (
            <Button size="sm" disabled={pending || importable === 0} onClick={() => run(() => runImportAction(batch.id))}><Play />{pending ? "Importing…" : `Import ${importable} row(s)`}</Button>
          )}
        </div>} />
      <div className="flex flex-wrap gap-1 border-b px-3 py-2 text-xs">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/imports/${batch.id}${k ? `?filter=${k}` : ""}`} className={cn("rounded px-2 py-0.5", filter === k ? "bg-primary text-white" : "bg-slate-100 hover:bg-slate-200")}>
            {l} <span className="tabular opacity-70">{k === "" ? batch.totalRows : k === "errors" ? actionCounts.ERROR ?? 0 : k === "warnings" ? batch.warningRows : actionCounts[k] ?? 0}</span>
          </Link>
        ))}
        {batch.status === "IMPORTED" && <Badge tone="green" className="ml-auto">Imported {batch.completedAt ? fmtDate(batch.completedAt, true) : ""}</Badge>}
      </div>
      <div className="px-3 pt-2"><Feedback result={result} /></div>
      <Table>
        <THead><tr><TH>Row</TH><TH>SKU</TH><TH>Action</TH><TH>Changes (PIM → file)</TH><TH>Errors / warnings</TH></tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={5}>No rows for this filter.</EmptyRow>}
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="tabular text-muted-foreground">{r.rowNumber}</TD>
              <TD className="font-mono text-[12px]">{r.sku ?? "—"}</TD>
              <TD><Badge tone={ACTION_TONE[r.action ?? ""] ?? "slate"}>{r.action ?? "—"}</Badge></TD>
              <TD className="max-w-[640px]">
                <div className="flex flex-wrap gap-1">
                  {r.diff.filter((d) => d.state !== "SAME").slice(0, 12).map((d) => (
                    <span key={d.field} className="inline-flex max-w-full items-center gap-1 rounded border px-1 py-px text-[11px]" title={`${fmt(d.current)} → ${fmt(d.incoming)}`}>
                      <Badge tone={STATE_TONE[d.state] ?? "slate"} className="px-1 py-0 text-[9px]">{d.state}</Badge>
                      <b>{fieldLabel(d.field)}</b>
                      <span className="truncate text-muted-foreground" dir="auto">{d.state === "FILL" && r.action === "CREATE" ? fmt(d.incoming) : `${fmt(d.current)} → ${fmt(d.incoming)}`}</span>
                    </span>
                  ))}
                </div>
              </TD>
              <TD className="max-w-[380px] text-[11px]">
                {r.errors.map((e, i) => <div key={i} className="text-red-600">✖ {e}</div>)}
                {r.warnings.map((w, i) => <div key={i} className="text-amber-700">⚠ {w}</div>)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {rows.length === 300 && <p className="p-2 text-xs text-muted-foreground">Showing the first 300 rows – download the full report for all rows.</p>}
    </Card>
  );
}
