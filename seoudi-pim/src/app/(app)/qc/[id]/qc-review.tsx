"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import type { FullProduct } from "@/lib/server/products";
import type { CompletenessResult } from "@/lib/domain/completeness";
import { QC_CHECKLIST, QC_OUTCOME_TONE, type QcDuplicates, type QcOutcome, type QcResult } from "@/lib/domain/qc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { CompletenessBar, QcBadge, StatusBadge } from "@/components/pim/badges";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { flagFieldAction, qcDecisionAction, resolveFlagAction, startQcAction } from "@/app/actions/qc";
import { fieldLabel } from "@/lib/labels";
import { cn, fmtDate, relTime } from "@/lib/utils";

type P = Omit<FullProduct, "attributeValues">;

interface Props {
  product: P;
  qc: QcResult;
  completeness: CompletenessResult;
  duplicates: QcDuplicates;
  rms: Record<string, unknown>;
  changes: { id: string; field: string; oldValue: string | null; newValue: string | null; actor: string; createdAt: Date }[];
  since: Date | null;
  flags: { id: string; fieldKey: string; message: string; severity: string; suspected: boolean; resolved: boolean; createdBy: string; createdAt: Date }[];
  fieldComments: { id: string; fieldKey: string; body: string; author: string; resolved: boolean; createdAt: Date }[];
  users: { id: string; name: string }[];
  nextId: string | null;
  canReview: boolean;
}

const FIELDS = ["nameEn", "nameAr", "volumeWeightEn", "volumeWeightAr", "weightKg", "brandId", "productType", "primaryCategoryId", "descriptionEn", "descriptionAr",
  "urlKey", "metaTitleEn", "metaTitleAr", "barcode", "images"];

export function QcReview(props: Props) {
  const { product: p, qc } = props;
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [assignTo, setAssignTo] = useState(p.ownerId ?? "");
  const { pending, result, run } = useAction();
  const issuesFor = (f: string) => qc.issues.filter((i) => i.field === f);
  const flagged = new Set(props.flags.filter((f) => !f.resolved).map((f) => f.fieldKey));
  const changed = new Set(props.changes.map((c) => c.field));
  const rows: { key: string; label: string; rms?: unknown; value: React.ReactNode; dir?: "rtl" }[] = [
    { key: "nameEn", label: "English title", rms: props.rms.rmsName, value: p.nameEn },
    { key: "nameAr", label: "Arabic title", rms: props.rms.rmsName, value: p.nameAr, dir: "rtl" },
    { key: "volumeWeightEn", label: "Size (EN)", value: p.volumeWeightEn },
    { key: "volumeWeightAr", label: "Size (AR)", value: p.volumeWeightAr, dir: "rtl" },
    { key: "weightKg", label: "Weight (kg)", value: p.weightKg != null ? String(p.weightKg) : null },
    { key: "brandId", label: "Brand", rms: props.rms.rmsBrand, value: p.brand?.name },
    { key: "productType", label: "Product type", value: p.productType },
    { key: "primaryCategoryId", label: "Category", rms: props.rms.rmsCategory, value: p.primaryCategory?.path.replace(/\//g, " › ") },
    { key: "descriptionEn", label: "Description (EN)", value: p.descriptionEn },
    { key: "descriptionAr", label: "Description (AR)", value: p.descriptionAr, dir: "rtl" },
    { key: "urlKey", label: "URL key", value: p.urlKey },
    { key: "metaTitleEn", label: "Meta title (EN)", value: p.metaTitleEn },
    { key: "metaTitleAr", label: "Meta title (AR)", value: p.metaTitleAr, dir: "rtl" },
    { key: "barcode", label: "Barcode", rms: props.rms.barcode, value: p.barcode },
  ];
  const allChecked = QC_CHECKLIST.every((c) => checklist[c.code]);
  const decide = (decision: "APPROVE" | "REJECT" | "REQUEST_EDIT") =>
    run(() => qcDecisionAction({ productId: p.id, decision, checklist, notes, assignTo: decision === "APPROVE" ? null : assignTo || null }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-5 py-2.5">
        <Link href="/qc" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Back to queue"><ChevronLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground"><span className="font-mono text-foreground">{p.sku}</span> · QC review · owner {p.owner?.name ?? "—"}</div>
          <h1 className="truncate text-base font-semibold">{p.nameEn ?? p.rmsName}</h1>
        </div>
        <StatusBadge status={p.status} />
        <QcBadge outcome={qc.outcome} score={qc.score} />
        <CompletenessBar value={props.completeness.percent} />
        <Link href={`/products/${p.id}`} className="text-xs text-primary hover:underline">Open product</Link>
        {props.nextId && <Button asChild size="sm" variant="outline"><Link href={`/qc/${props.nextId}`}>Next in queue<ChevronRight /></Link></Button>}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="RMS data vs created content" actions={<span className="text-[11px] text-muted-foreground">amber = changed since {props.since ? fmtDate(props.since, true) : "creation"} · red = flagged</span>} />
            <Table>
              <THead><tr><TH className="w-40">Field</TH><TH className="w-56">RMS</TH><TH>Created content</TH><TH className="w-64">Automated checks</TH></tr></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key} className={cn(flagged.has(r.key) ? "bg-red-50/70" : changed.has(r.key) && "bg-amber-50/60")}>
                    <TD className="font-medium">{r.label}{changed.has(r.key) && <Badge tone="amber" className="ml-1">changed</Badge>}</TD>
                    <TD dir="auto" className="text-muted-foreground">{r.rms != null && r.rms !== "" ? String(r.rms) : "—"}</TD>
                    <TD dir={r.dir} className={cn("whitespace-pre-wrap", r.dir === "rtl" && "text-right")}>{r.value ?? <span className="text-red-600">missing</span>}</TD>
                    <TD>
                      {issuesFor(r.key).map((i, n) => (
                        <div key={n} className="text-[11px] leading-4"><Badge tone={QC_OUTCOME_TONE[i.outcome]} className="mr-1 px-1 text-[10px]">{i.outcome === "NEEDS_REVIEW" ? "REVIEW" : i.outcome}</Badge>{i.message}</div>
                      ))}
                      {props.fieldComments.filter((c) => c.fieldKey === r.key && !c.resolved).map((c) => (
                        <div key={c.id} className="text-[11px] text-amber-800">💬 {c.author}: {c.body}</div>
                      ))}
                    </TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-medium">Images</TD><TD>—</TD>
                  <TD colSpan={2}>
                    <div className="flex gap-2">
                      {p.images.length === 0 && <span className="text-red-600">no images</span>}
                      {p.images.map((i) => (
                        <div key={i.id} className="text-center text-[10px] text-muted-foreground">
                          {i.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.url} alt="" className="size-24 rounded border object-cover" />
                          ) : <div className="grid size-24 place-items-center rounded border border-dashed">{i.status}</div>}
                          {i.role} · {i.status}
                        </div>
                      ))}
                    </div>
                  </TD>
                </TR>
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title={`Changed fields (${props.changes.length})`} />
            <Table>
              <THead><tr><TH>When</TH><TH>By</TH><TH>Field</TH><TH>Before</TH><TH>After</TH></tr></THead>
              <TBody>
                {props.changes.length === 0 && <EmptyRow colSpan={5}>No field changes since the last submission/review.</EmptyRow>}
                {props.changes.map((c) => (
                  <TR key={c.id}><TD className="whitespace-nowrap">{relTime(c.createdAt)}</TD><TD>{c.actor}</TD><TD>{fieldLabel(c.field)}</TD>
                    <TD dir="auto" className="max-w-xs truncate text-muted-foreground line-through decoration-red-300">{c.oldValue ?? "—"}</TD>
                    <TD dir="auto" className="max-w-xs truncate">{c.newValue ?? "—"}</TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {(props.duplicates.barcode?.length || props.duplicates.nameEn?.length || props.duplicates.urlKey?.length || props.duplicates.similarNameEn?.length) ? (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs">Possible duplicates: {[...(props.duplicates.barcode ?? []), ...(props.duplicates.nameEn ?? []), ...(props.duplicates.urlKey ?? []), ...(props.duplicates.similarNameEn ?? [])].join(", ")}</div>
          ) : null}
        </div>

        <div className="space-y-4">
          {props.canReview ? (
            <Card>
              <CardHeader title="Decision" />
              <div className="space-y-3 p-3">
                {p.status === "READY_FOR_QC" && (
                  <Button size="sm" variant="outline" className="w-full" disabled={pending} onClick={() => run(() => startQcAction(p.id))}>Start QC (claim item)</Button>
                )}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase text-muted-foreground">
                    Checklist <button className="normal-case text-primary" onClick={() => setChecklist(Object.fromEntries(QC_CHECKLIST.map((c) => [c.code, !allChecked])))}>{allChecked ? "clear" : "check all"}</button>
                  </div>
                  {QC_CHECKLIST.map((c) => (
                    <label key={c.code} className="flex items-start gap-2 py-0.5 text-xs">
                      <input type="checkbox" className="mt-0.5" checked={!!checklist[c.code]} onChange={(e) => setChecklist({ ...checklist, [c.code]: e.target.checked })} />{c.label}
                    </label>
                  ))}
                </div>
                <Textarea rows={3} placeholder="Precise feedback for the content creator (required to reject / request edit)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Assign back to</span>
                  <NativeSelect className="h-7 flex-1 text-xs" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                    <option value="">Keep current owner</option>
                    {props.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button size="sm" disabled={pending || !allChecked} onClick={() => decide("APPROVE")} title={allChecked ? "" : "Complete the checklist first"}><ThumbsUp />Approve</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("REQUEST_EDIT")}><Undo2 />Request edit</Button>
                  <Button size="sm" variant="destructive" disabled={pending} onClick={() => decide("REJECT")}><ThumbsDown />Reject</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Approval is blocked while automated QC has errors or field flags are open.</p>
                <Feedback result={result} />
              </div>
            </Card>
          ) : <Card className="p-3 text-xs text-muted-foreground">Read-only: your role cannot record QC decisions.</Card>}

          {props.canReview && <FlagForm productId={p.id} />}

          <Card>
            <CardHeader title={`Field flags (${props.flags.filter((f) => !f.resolved).length} open)`} />
            <div className="space-y-1.5 p-3">
              {props.flags.length === 0 && <p className="text-xs text-muted-foreground">No flags.</p>}
              {props.flags.map((f) => <FlagRow key={f.id} f={f} />)}
            </div>
          </Card>

          <Card>
            <CardHeader title="All automated findings" actions={<QcBadge outcome={qc.outcome} score={qc.score} />} />
            <ul className="max-h-72 space-y-1 overflow-y-auto p-3">
              {qc.issues.length === 0 && <li className="text-xs text-emerald-700">All rules pass.</li>}
              {qc.issues.map((i, n) => (
                <li key={n} className="text-[11.5px]"><Badge tone={QC_OUTCOME_TONE[i.outcome]} className="mr-1 px-1 text-[10px]">{i.outcome}</Badge><b>{fieldLabel(i.field)}</b>: {i.message}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FlagForm({ productId }: { productId: string }) {
  const [field, setField] = useState("nameAr");
  const [msg, setMsg] = useState("");
  const [severity, setSeverity] = useState<QcOutcome>("ERROR");
  const [suspected, setSuspected] = useState(false);
  const { pending, result, run } = useAction();
  return (
    <Card>
      <CardHeader title="Flag a field" />
      <div className="space-y-2 p-3">
        <div className="flex gap-1.5">
          <NativeSelect className="h-7 text-xs" value={field} onChange={(e) => setField(e.target.value)}>
            {FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
          </NativeSelect>
          <NativeSelect className="h-7 w-32 text-xs" value={severity} onChange={(e) => setSeverity(e.target.value as QcOutcome)}>
            <option value="ERROR">Error</option><option value="NEEDS_REVIEW">Needs review</option><option value="WARNING">Warning</option>
          </NativeSelect>
        </div>
        <Input className="h-8 text-xs" placeholder="What exactly is wrong?" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={suspected} onChange={(e) => setSuspected(e.target.checked)} />Mark as suspected (verify against the physical product)</label>
        <Button size="sm" variant="outline" disabled={pending || msg.trim().length < 3} onClick={() => run(() => flagFieldAction(productId, field, msg, severity, suspected), () => setMsg(""))}><Flag />Add flag</Button>
        <Feedback result={result} />
      </div>
    </Card>
  );
}

function FlagRow({ f }: { f: Props["flags"][number] }) {
  const { pending, run } = useAction();
  return (
    <div className={cn("rounded border p-2 text-xs", f.resolved && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{fieldLabel(f.fieldKey)} <Badge tone={QC_OUTCOME_TONE[f.severity as QcOutcome] ?? "slate"} className="text-[10px]">{f.severity}</Badge>
          {f.suspected && <Badge tone="violet" className="ml-1 text-[10px]">Suspected</Badge>}</span>
        <button disabled={pending} className="inline-flex items-center gap-0.5 text-[11px] text-primary" onClick={() => run(() => resolveFlagAction(f.id, !f.resolved))}>
          <Check className="size-3" />{f.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>
      <p dir="auto">{f.message}</p>
      <div className="text-[10px] text-muted-foreground">{f.createdBy} · {relTime(f.createdAt)}{f.resolved && " · resolved"}</div>
    </div>
  );
}
