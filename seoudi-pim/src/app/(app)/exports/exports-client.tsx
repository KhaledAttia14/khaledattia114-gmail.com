"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { MultiFilter } from "@/components/pim/multi-filter";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { saveExportProfileAction } from "@/app/actions/exports";
import { STATUS_LABELS, WORKFLOW_STATUSES } from "@/lib/domain/workflow";
import type { ExportColumn } from "@/lib/domain/magento";
import { fmtDate } from "@/lib/utils";

interface Profile { id: string; code: string; name: string; kind: "PRODUCT" | "CATEGORY"; storeViewCode: string | null; locale: "en" | "ar"; columns: ExportColumn[]; categorySeparator: string; active: boolean }

interface Props {
  profiles: Profile[];
  selected: string | null;
  filters: { status: string; category: string; q: string };
  query: string;
  total: number;
  preview: { headers: string[]; rows: Record<string, string>[]; warnings: string[]; warningCount: number } | null;
  categories: { id: string; path: string }[];
  sources: { key: string; label: string }[];
  recent: { id: string; profile: string; rows: string | null; warnings: string | null; actor: string; createdAt: Date }[];
  perms: { export: boolean; configure: boolean; record: boolean };
}

export function ExportsClient(p: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [record, setRecord] = useState(false);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const go = (patch: Record<string, string>) => {
    const s = new URLSearchParams(p.query);
    if (p.selected) s.set("profile", p.selected);
    for (const [k, v] of Object.entries(patch)) { if (v) s.set(k, v); else s.delete(k); }
    router.push(`${pathname}?${s.toString()}`);
  };
  const profile = p.profiles.find((x) => x.code === p.selected);
  const href = `/api/export?profile=${p.selected}&${p.query}${record ? "&record=1" : ""}`;
  return (
    <div className="grid gap-4 p-5 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Export profiles" actions={p.perms.configure && <Button size="xs" variant="outline" onClick={() => setEditing("new")}><Plus />New</Button>} />
          <div className="divide-y">
            {p.profiles.map((x) => (
              <button key={x.id} onClick={() => go({ profile: x.code })} className={`block w-full px-3 py-2 text-left hover:bg-muted ${x.code === p.selected ? "bg-accent" : ""}`}>
                <div className="flex items-center justify-between text-[12.5px] font-medium">{x.name}{!x.active && <Badge>inactive</Badge>}</div>
                <div className="text-[11px] text-muted-foreground">{x.code} · {x.kind} · {x.storeViewCode ?? "no store view"} · {x.locale.toUpperCase()} · {x.columns.length} cols</div>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent exports" />
          <Table><TBody>
            {p.recent.length === 0 && <EmptyRow colSpan={3}>None yet.</EmptyRow>}
            {p.recent.map((r) => <TR key={r.id}><TD className="whitespace-nowrap text-[11px]">{fmtDate(r.createdAt, true)}</TD><TD className="text-[11px]">{r.profile}<div className="text-muted-foreground">{r.rows}{r.warnings ? ` · ${r.warnings}` : ""}</div></TD><TD className="text-[11px]">{r.actor}</TD></TR>)}
          </TBody></Table>
        </Card>
      </div>
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader title={profile ? profile.name : "Select a profile"} actions={profile && p.perms.configure && <Button size="xs" variant="ghost" onClick={() => setEditing(profile)}>Edit profile</Button>} />
          <div className="flex flex-wrap items-center gap-2 p-3">
            <MultiFilter label="Status" value={p.filters.status.split(",").filter(Boolean)} onChange={(v) => go({ status: v.join(",") })}
              options={WORKFLOW_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
            <NativeSelect className="h-7 w-64 text-xs" value={p.filters.category} onChange={(e) => go({ category: e.target.value })}>
              <option value="">All categories</option>{p.categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
            </NativeSelect>
            <Input className="h-7 w-52 text-xs" placeholder="Search…" defaultValue={p.filters.q} onKeyDown={(e) => e.key === "Enter" && go({ q: (e.target as HTMLInputElement).value })} />
            <span className="text-xs text-muted-foreground">{p.total} product(s)</span>
            {p.perms.record && profile?.storeViewCode && (
              <label className="flex items-center gap-1 text-xs" title="Stores what was exported as a Magento snapshot so the comparison view can detect drift">
                <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />Record as Magento snapshot
              </label>
            )}
            {p.perms.export && profile && <Button size="sm" asChild className="ml-auto"><a href={href}><Download />Download CSV</a></Button>}
          </div>
          {p.preview && p.preview.warningCount > 0 && (
            <div className="mx-3 mb-3 max-h-32 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <b>{p.preview.warningCount} warning(s)</b> – exported anyway, review before importing into Magento:
              <ul className="list-disc pl-4">{p.preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {p.preview && (
            <div className="max-h-[480px] overflow-auto border-t">
              <Table>
                <THead><tr>{p.preview.headers.map((h) => <TH key={h} className="normal-case">{h}</TH>)}</tr></THead>
                <TBody>
                  {p.preview.rows.length === 0 && <EmptyRow colSpan={p.preview.headers.length}>No products match.</EmptyRow>}
                  {p.preview.rows.map((r, i) => (
                    <TR key={i}>{p.preview!.headers.map((h) => <TD key={h} dir="auto" className="max-w-[260px] truncate text-[11.5px]" title={r[h]}>{r[h]}</TD>)}</TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
        {editing && <ProfileEditor profile={editing === "new" ? null : editing} sources={p.sources} onDone={() => setEditing(null)} />}
      </div>
    </div>
  );
}

function ProfileEditor({ profile, sources, onDone }: { profile: Profile | null; sources: { key: string; label: string }[]; onDone: () => void }) {
  const [f, setF] = useState<Omit<Profile, "id">>(profile ?? { code: "", name: "", kind: "PRODUCT", storeViewCode: "default", locale: "en", columns: [{ header: "sku", source: "sku" }], categorySeparator: "|", active: true });
  const { pending, result, run } = useAction();
  const setCol = (i: number, patch: Partial<ExportColumn>) => setF({ ...f, columns: f.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <Card>
      <CardHeader title={profile ? `Edit ${profile.code}` : "New export profile"} actions={<Button size="xs" variant="ghost" onClick={onDone}>Close</Button>} />
      <div className="grid gap-3 p-3 md:grid-cols-3">
        <div><Label>Code</Label><Input value={f.code} disabled={!!profile} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></div>
        <div className="md:col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Kind</Label><NativeSelect value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Profile["kind"] })}><option>PRODUCT</option><option>CATEGORY</option></NativeSelect></div>
        <div><Label>Store view code</Label><Input value={f.storeViewCode ?? ""} onChange={(e) => setF({ ...f, storeViewCode: e.target.value || null })} placeholder="default / ar_EG / empty" /></div>
        <div><Label>Language</Label><NativeSelect value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "en" | "ar" })}><option value="en">English</option><option value="ar">Arabic</option></NativeSelect></div>
        <div><Label>Category separator</Label><Input value={f.categorySeparator} onChange={(e) => setF({ ...f, categorySeparator: e.target.value })} /></div>
        <label className="flex items-end gap-1 text-xs"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>
      </div>
      <Table>
        <THead><tr><TH>#</TH><TH>CSV header</TH><TH>Source field</TH><TH /></tr></THead>
        <TBody>
          {f.columns.map((c, i) => (
            <TR key={i}>
              <TD className="tabular text-muted-foreground">{i + 1}</TD>
              <TD><Input className="h-7 text-xs" value={c.header} onChange={(e) => setCol(i, { header: e.target.value })} /></TD>
              <TD><NativeSelect className="h-7 text-xs" value={c.source} onChange={(e) => setCol(i, { source: e.target.value })}>{sources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.key})</option>)}</NativeSelect></TD>
              <TD><Button size="icon" variant="ghost" aria-label="Remove column" onClick={() => setF({ ...f, columns: f.columns.filter((_, j) => j !== i) })}><Trash2 /></Button></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center gap-2 p-3">
        <Button size="sm" variant="outline" onClick={() => setF({ ...f, columns: [...f.columns, { header: "", source: "sku" }] })}><Plus />Add column</Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => saveExportProfileAction({ ...f, id: profile?.id }), onDone)}>Save profile</Button>
        <Feedback result={result} />
      </div>
    </Card>
  );
}
