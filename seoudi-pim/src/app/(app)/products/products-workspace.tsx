"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Download, Plus, Save, Trash2, X } from "lucide-react";
import type { ProductListRow, ProductFilters } from "@/lib/server/product-query";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MultiFilter } from "@/components/pim/multi-filter";
import { CompletenessBar, ImageBadge, PriorityBadge, QcBadge, StatusBadge } from "@/components/pim/badges";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { bulkAction, deleteViewAction, saveViewAction } from "@/app/actions/products";
import { STATUS_LABELS, WORKFLOW_STATUSES } from "@/lib/domain/workflow";
import { IMAGE_LABELS, IMAGE_STATUSES, PRIORITIES, QC_LABELS, fieldLabel } from "@/lib/labels";
import { cn, fmtDate, isOverdue, relTime } from "@/lib/utils";

const COLUMNS = [
  { key: "image", label: "Image" },
  { key: "sku", label: "SKU", sort: "sku" },
  { key: "title", label: "Title (EN / AR)", sort: "nameEn" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "size", label: "Size" },
  { key: "status", label: "Status", sort: "status" },
  { key: "qc", label: "QC", sort: "qcScore" },
  { key: "completeness", label: "Complete", sort: "completeness" },
  { key: "images", label: "Images" },
  { key: "owner", label: "Owner" },
  { key: "priority", label: "Priority", sort: "priority" },
  { key: "campaign", label: "Campaign" },
  { key: "due", label: "Due", sort: "dueDate" },
  { key: "missing", label: "Missing" },
  { key: "updated", label: "Updated", sort: "updatedAt" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_COLS: ColKey[] = ["image", "sku", "title", "brand", "category", "status", "qc", "completeness", "images", "owner", "priority", "due", "updated"];

const MISSING_OPTIONS = ["nameEn", "nameAr", "descriptionEn", "descriptionAr", "brandId", "primaryCategoryId", "productType", "volumeWeightEn",
  "volumeWeightAr", "image:main", "urlKey", "metaTitleEn", "metaTitleAr", "weightKg", "barcode"];

interface Props {
  rows: ProductListRow[];
  total: number;
  filters: ProductFilters;
  cols: string[] | null;
  query: string;
  options: { categories: { id: string; path: string }[]; users: { id: string; name: string; role: string }[]; brands: { id: string; name: string }[]; campaigns: string[] };
  views: { id: string; name: string; query: string; isSystem: boolean; mine: boolean; columns: string[] }[];
  profiles: { code: string; name: string }[];
  perms: { bulk: boolean; assign: boolean; create: boolean; transition: boolean };
}

export function ProductsWorkspace({ rows, total, filters: f, cols, query, options, views, profiles, perms }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(f.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = useMemo(() => new Set<ColKey>((cols as ColKey[] | null) ?? DEFAULT_COLS), [cols]);

  const params = useMemo(() => new URLSearchParams(query), [query]);
  const push = (mut: (p: URLSearchParams) => void, resetPage = true) => {
    const p = new URLSearchParams(params);
    mut(p);
    if (resetPage) p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  };
  const setParam = (k: string, v: string | string[] | undefined | null) =>
    push((p) => { const s = Array.isArray(v) ? v.join(",") : v; if (s) p.set(k, s); else p.delete(k); });

  useEffect(() => { setSelected(new Set()); }, [query]);
  useEffect(() => {
    const t = setTimeout(() => { if ((f.q ?? "") !== q) setParam("q", q); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleCol = (k: ColKey) => {
    const next = new Set(visible);
    if (next.has(k)) next.delete(k); else next.add(k);
    setParam("cols", COLUMNS.map((c) => c.key).filter((c) => next.has(c)));
  };
  const sortBy = (key: string) => push((p) => { p.set("sort", key); p.set("dir", f.sort === key && f.dir === "desc" ? "asc" : "desc"); }, false);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pages = Math.max(1, Math.ceil(total / f.pageSize));
  const activeView = views.find((v) => normalizeQuery(v.query) === normalizeQuery(query));
  const hasFilters = ["q", "status", "category", "brand", "owner", "qc", "images", "priority", "campaign", "missing", "overdue", "from", "to"].some((k) => params.get(k));

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-base font-semibold">Products</h1>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, barcode, EN/AR title, brand…" className="h-8 w-80" />
          <NativeSelect className="h-8 w-48" value={activeView?.id ?? ""} onChange={(e) => {
            const v = views.find((x) => x.id === e.target.value);
            router.push(v ? `${pathname}?${v.query}${v.columns.length ? `&cols=${v.columns.join(",")}` : ""}` : pathname);
          }}>
            <option value="">Saved views…</option>
            <optgroup label="Standard">{views.filter((v) => v.isSystem).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>
            <optgroup label="Custom">{views.filter((v) => !v.isSystem).map((v) => <option key={v.id} value={v.id}>{v.name}{v.mine ? "" : " (shared)"}</option>)}</optgroup>
          </NativeSelect>
          <SaveView query={query} columns={cols ?? []} />
          {activeView && !activeView.isSystem && activeView.mine && <DeleteView id={activeView.id} />}
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 />Columns</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {COLUMNS.map((c) => (
                  <DropdownMenuCheckboxItem key={c.key} checked={visible.has(c.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggleCol(c.key)}>{c.label}</DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuItem onSelect={() => setParam("cols", null)}>Reset to default</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Download />Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export current filter ({total})</DropdownMenuLabel>
                {profiles.map((p) => (
                  <DropdownMenuItem key={p.code} asChild><a href={`/api/export?profile=${p.code}&${query}`}>{p.name}</a></DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {perms.create && <Button size="sm" asChild><Link href="/products/new"><Plus />New product</Link></Button>}
          </div>
        </div>
        {/* filters */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <MultiFilter label="Status" value={f.status} onChange={(v) => setParam("status", v)}
            options={WORKFLOW_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
          <NativeSelect className="h-7 w-52 text-xs" value={f.category ?? ""} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">All categories</option>
            <option value="none">— No category —</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
          </NativeSelect>
          <NativeSelect className="h-7 w-36 text-xs" value={f.brand ?? ""} onChange={(e) => setParam("brand", e.target.value)}>
            <option value="">All brands</option>
            <option value="none">— No brand —</option>
            {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
          <NativeSelect className="h-7 w-36 text-xs" value={f.owner ?? ""} onChange={(e) => setParam("owner", e.target.value)}>
            <option value="">All owners</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
            {options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
          <MultiFilter label="QC" value={f.qc} onChange={(v) => setParam("qc", v)}
            options={[...Object.entries(QC_LABELS).map(([value, label]) => ({ value, label })), { value: "NONE", label: "Not evaluated" }]} />
          <MultiFilter label="Images" value={f.images} onChange={(v) => setParam("images", v)}
            options={IMAGE_STATUSES.map((s) => ({ value: s, label: IMAGE_LABELS[s] }))} />
          <MultiFilter label="Priority" value={f.priority} onChange={(v) => setParam("priority", v)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
          <MultiFilter label="Missing data" value={f.missing} onChange={(v) => setParam("missing", v)}
            options={MISSING_OPTIONS.map((m) => ({ value: m, label: fieldLabel(m) }))} />
          <NativeSelect className="h-7 w-36 text-xs" value={f.campaign ?? ""} onChange={(e) => setParam("campaign", e.target.value)}>
            <option value="">All campaigns</option>
            <option value="none">— No campaign —</option>
            {options.campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
          <label className={cn("inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs", f.overdue ? "border-red-300 bg-red-50 text-red-700" : "border-input bg-card")}>
            <input type="checkbox" className="size-3" checked={!!f.overdue} onChange={(e) => setParam("overdue", e.target.checked ? "1" : null)} />Overdue
          </label>
          <NativeSelect className="h-7 w-28 text-xs" value={f.dateField} onChange={(e) => setParam("dateField", e.target.value)}>
            <option value="createdAt">Created</option><option value="updatedAt">Updated</option>
            <option value="dueDate">Due</option><option value="statusChangedAt">Status changed</option>
          </NativeSelect>
          <Input type="date" className="h-7 w-32 text-xs" value={f.from ?? ""} onChange={(e) => setParam("from", e.target.value)} aria-label="From date" />
          <Input type="date" className="h-7 w-32 text-xs" value={f.to ?? ""} onChange={(e) => setParam("to", e.target.value)} aria-label="To date" />
          {hasFilters && <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}><X />Clear</Button>}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkBar ids={[...selected]} options={options} perms={perms} profiles={profiles} onDone={() => setSelected(new Set())} />
      )}

      {/* table */}
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <Table>
          <THead>
            <tr>
              <TH className="w-8"><input type="checkbox" aria-label="Select all" checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></TH>
              {COLUMNS.filter((c) => visible.has(c.key)).map((c) => (
                <TH key={c.key}>
                  {"sort" in c && c.sort ? (
                    <button className="inline-flex items-center gap-0.5 uppercase hover:text-foreground" onClick={() => sortBy(c.sort!)}>
                      {c.label}
                      {f.sort === c.sort && (f.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : c.label}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={visible.size + 1}>No products match these filters.</EmptyRow>}
            {rows.map((r) => {
              const done = ["LIVE", "FINAL_REVIEW", "COMPLETED"].includes(r.status);
              return (
                <TR key={r.id} data-selected={selected.has(r.id)}>
                  <TD><input type="checkbox" aria-label={`Select ${r.sku}`} checked={selected.has(r.id)} onChange={() => {
                    const n = new Set(selected); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelected(n);
                  }} /></TD>
                  {visible.has("image") && <TD className="w-10">
                    {r.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.images[0].url} alt="" className="size-8 rounded border object-cover" loading="lazy" />
                    ) : <div className="size-8 rounded border border-dashed bg-slate-50" />}
                  </TD>}
                  {visible.has("sku") && <TD className="tabular whitespace-nowrap font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/products/${r.id}`}>{r.sku}</Link></TD>}
                  {visible.has("title") && <TD className="max-w-[360px]">
                    <Link href={`/products/${r.id}`} className="block truncate font-medium hover:underline">{r.nameEn ?? <span className="italic text-muted-foreground">{r.rmsName ?? "Untitled"}</span>}</Link>
                    <div dir="rtl" className="truncate text-right text-[12px] text-muted-foreground">{r.nameAr ?? "—"}</div>
                  </TD>}
                  {visible.has("brand") && <TD className="whitespace-nowrap">{r.brand?.name ?? <span className="text-muted-foreground">—</span>}</TD>}
                  {visible.has("category") && <TD className="max-w-[180px] truncate text-muted-foreground" title={r.primaryCategory?.path}>{r.primaryCategory?.name ?? "—"}</TD>}
                  {visible.has("size") && <TD className="whitespace-nowrap">{r.volumeWeightEn ?? "—"}</TD>}
                  {visible.has("status") && <TD><StatusBadge status={r.status} /></TD>}
                  {visible.has("qc") && <TD><QcBadge outcome={r.qcOutcome} score={r.qcScore} /></TD>}
                  {visible.has("completeness") && <TD><CompletenessBar value={r.completeness} /></TD>}
                  {visible.has("images") && <TD><ImageBadge status={r.imageStatus} /></TD>}
                  {visible.has("owner") && <TD className="whitespace-nowrap">{r.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TD>}
                  {visible.has("priority") && <TD><PriorityBadge priority={r.priority} /></TD>}
                  {visible.has("campaign") && <TD className="whitespace-nowrap text-muted-foreground">{r.campaign ?? "—"}</TD>}
                  {visible.has("due") && <TD className={cn("tabular whitespace-nowrap", isOverdue(r.dueDate, done) && "font-medium text-red-600")}>{r.dueDate ? fmtDate(r.dueDate) : "—"}</TD>}
                  {visible.has("missing") && <TD className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={r.missingFields.map(fieldLabel).join(", ")}>
                    {r.missingFields.length ? r.missingFields.map(fieldLabel).join(", ") : "—"}</TD>}
                  {visible.has("updated") && <TD className="whitespace-nowrap text-muted-foreground" title={fmtDate(r.updatedAt, true)}>{relTime(r.updatedAt)}</TD>}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between gap-2 border-t bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <div className="tabular">{total.toLocaleString()} products · page {f.page} of {pages}</div>
        <div className="flex items-center gap-1.5">
          <NativeSelect className="h-7 w-24 text-xs" value={String(f.pageSize)} onChange={(e) => setParam("pageSize", e.target.value)}>
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </NativeSelect>
          <Button variant="outline" size="sm" disabled={f.page <= 1} onClick={() => push((p) => p.set("page", String(f.page - 1)), false)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={f.page >= pages} onClick={() => push((p) => p.set("page", String(f.page + 1)), false)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function normalizeQuery(q: string) {
  const p = new URLSearchParams(q);
  ["page", "cols", "sort", "dir", "pageSize"].forEach((k) => p.delete(k));
  return [...p.entries()].sort().map(([k, v]) => `${k}=${v}`).join("&");
}

function SaveView({ query, columns }: { query: string; columns: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const { pending, result, run } = useAction();
  const q = new URLSearchParams(query);
  q.delete("cols");
  q.delete("page");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Save />Save view</Button>
      <DialogContent title="Save current view" description="Filters, sorting and visible columns are stored on the server.">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Share with the team</label>
          <Feedback result={result} />
          <Button disabled={pending} onClick={() => run(() => saveViewAction(name, q.toString(), columns, shared), () => setOpen(false))}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteView({ id }: { id: string }) {
  const { pending, run } = useAction();
  return <Button variant="ghost" size="icon" disabled={pending} title="Delete view" onClick={() => run(() => deleteViewAction(id))}><Trash2 /></Button>;
}

function BulkBar({ ids, options, perms, profiles, onDone }: { ids: string[]; options: Props["options"]; perms: Props["perms"]; profiles: Props["profiles"]; onDone: () => void }) {
  const [kind, setKind] = useState<string>(perms.assign ? "assign" : "status");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const { pending, result, run, setResult } = useAction();
  const kinds = [
    ...(perms.assign ? [["assign", "Assign owner"], ["reviewer", "Assign QC reviewer"], ["priority", "Set priority"], ["dueDate", "Set due date"], ["campaign", "Set campaign"]] : []),
    ...(perms.transition ? [["status", "Change status (validated)"]] : []),
    ...(perms.bulk ? [["category", "Set primary category"], ["imageStatus", "Set image status"]] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs">
      <span className="font-semibold">{ids.length} selected</span>
      <NativeSelect className="h-7 w-52 text-xs" value={kind} onChange={(e) => { setKind(e.target.value); setValue(""); setResult(null); }}>
        {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </NativeSelect>
      {(kind === "assign" || kind === "reviewer") && (
        <NativeSelect className="h-7 w-44 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Unassign</option>
          {options.users.filter((u) => u.role !== "VIEWER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
      )}
      {kind === "status" && (
        <NativeSelect className="h-7 w-48 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose status…</option>
          {WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </NativeSelect>
      )}
      {kind === "category" && (
        <NativeSelect className="h-7 w-64 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose category…</option>
          {options.categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
        </NativeSelect>
      )}
      {kind === "priority" && (
        <NativeSelect className="h-7 w-32 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </NativeSelect>
      )}
      {kind === "imageStatus" && (
        <NativeSelect className="h-7 w-40 text-xs" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose…</option>{IMAGE_STATUSES.map((p) => <option key={p} value={p}>{IMAGE_LABELS[p]}</option>)}
        </NativeSelect>
      )}
      {kind === "dueDate" && <Input type="date" className="h-7 w-36 text-xs" value={value} onChange={(e) => setValue(e.target.value)} />}
      {kind === "campaign" && <Input className="h-7 w-40 text-xs" placeholder="Campaign" value={value} onChange={(e) => setValue(e.target.value)} list="campaigns" />}
      <datalist id="campaigns">{options.campaigns.map((c) => <option key={c} value={c} />)}</datalist>
      <Input className="h-7 w-48 text-xs" placeholder="Reason (required for reject/block)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" disabled={pending || (["status", "category", "priority", "imageStatus"].includes(kind) && !value)}
        onClick={() => run(() => bulkAction(ids, kind as never, value, reason || undefined))}>Apply</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Download />Export selected</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {profiles.map((p) => <DropdownMenuItem key={p.code} asChild><a href={`/api/export?profile=${p.code}&ids=${ids.join(",")}`}>{p.name}</a></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={onDone}>Clear selection</Button>
      {result && <Feedback result={result} className="w-full" />}
    </div>
  );
}
