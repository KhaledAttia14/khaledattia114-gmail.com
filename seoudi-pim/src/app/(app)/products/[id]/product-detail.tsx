"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, RefreshCw, Sparkles } from "lucide-react";
import type { FullProduct } from "@/lib/server/products";
import type { CompletenessResult } from "@/lib/domain/completeness";
import type { QcDuplicates, QcResult } from "@/lib/domain/qc";
import type { ParsedSize } from "@/lib/domain/units";
import type { CompareState } from "@/lib/domain/compare";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { CompletenessBar, PriorityBadge, QcBadge, StatusBadge } from "@/components/pim/badges";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { generateDerivedAction, recomputeAction, setAdditionalCategoriesAction, setAttributeAction, upsertBrandAction, updateProductAction } from "@/app/actions/products";
import { PRIORITIES, IMAGE_STATUSES, IMAGE_LABELS, fieldLabel } from "@/lib/labels";
import { cn, fmtDate, isOverdue } from "@/lib/utils";
import { FieldForm, type FieldSpec } from "./field-form";
import { CommentsPanel, CompletenessPanel, FlagsList, ImagesPanel, Panel, QcPanel, WorkflowPanel, type CommentView, type TransitionOption } from "./side-panels";

type ProductData = Omit<FullProduct, "attributeValues"> & { attributeValues?: undefined };

interface AttrDef {
  id: string; code: string; label: string; labelAr: string | null; type: string; options: { value: string; label: string }[];
  unit: string | null; localized: boolean; group: string; helpText: string | null; required: boolean; inSet: boolean;
}

interface Props {
  product: ProductData;
  evaluation: { completeness: CompletenessResult; qc: QcResult; checks: Record<string, boolean | undefined>; details: Record<string, string | undefined>; duplicates: QcDuplicates; lineage: { id: string; name: string; path: string }[] };
  size: ParsedSize & { suggestedWeightKg: number | null };
  transitions: TransitionOption[];
  options: { users: { id: string; name: string; role: string }[]; brands: { id: string; name: string; nameAr: string | null }[]; categories: { id: string; path: string; name: string }[]; attributeSets: { id: string; name: string; code: string }[] };
  attributes: AttrDef[];
  attributeValues: { attributeId: string; locale: string; value: unknown }[];
  attributeMap: Record<string, unknown>;
  comments: CommentView[];
  history: { id: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; source: string; reason: string | null; actor: string; createdAt: Date }[];
  comparison: { key: string; label: string; rms: unknown; pim: unknown; magento: unknown; state: CompareState; note: string }[];
  rmsChanges: { field: string; before: unknown; after: unknown }[];
  rmsSnapshotAt: Date | null;
  magentoSnapshotAt: Date | null;
  flags: { id: string; fieldKey: string; message: string; severity: string; suspected: boolean; resolved: boolean; createdBy: string; createdAt: Date }[];
  reviews: { id: string; decision: string; outcome: string; score: number | null; notes: string | null; reviewer: string; createdAt: Date }[];
  perms: { editable: Record<string, boolean>; comment: boolean; qc: boolean; images: boolean };
  users: string[];
}

const STATE_TONE: Record<CompareState, Tone> = { SAME: "green", CHANGED: "amber", MISSING: "slate", CONFLICT: "red" };

export function ProductDetail(props: Props) {
  const { product: p, evaluation: ev, perms } = props;
  const [tab, setTab] = useState("overview");
  const [commentField, setCommentField] = useState("");
  const values = p as unknown as Record<string, unknown>;
  const issuesFor = (f: string) => ev.qc.issues.filter((i) => i.field === f && i.outcome !== "PASS").map((i) => i.message);
  const commentCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of props.comments) if (c.fieldKey && !c.resolved) m[c.fieldKey] = (m[c.fieldKey] ?? 0) + 1;
    return m;
  }, [props.comments]);
  const onComment = (k: string) => setCommentField(k);
  const common = { productId: p.id, values, editable: perms.editable, onComment: perms.comment ? onComment : undefined, commentCounts };
  const userOpts = props.options.users.filter((u) => u.role !== "VIEWER").map((u) => ({ value: u.id, label: u.name }));
  const done = ["LIVE", "FINAL_REVIEW", "COMPLETED"].includes(p.status);

  const overviewFields: FieldSpec[] = [
    { key: "barcode", label: "Barcode", issues: issuesFor("barcode") },
    { key: "rmsName", label: "RMS name", dir: "rtl" },
    { key: "rmsBrand", label: "RMS brand" },
    { key: "rmsCategory", label: "RMS category / department" },
    { key: "productType", label: "Product type", hint: "Head noun used in titles, e.g. Honey, Lunch Box", issues: issuesFor("productType") },
    { key: "productLine", label: "Product line" },
    { key: "ownerId", label: "Owner", type: "select", options: userOpts },
    { key: "qcReviewerId", label: "QC reviewer", type: "select", options: userOpts },
    { key: "priority", label: "Priority", type: "select", options: PRIORITIES.map((x) => ({ value: x, label: x })) },
    { key: "dueDate", label: "Due date", type: "date" },
    { key: "campaign", label: "Campaign" },
    { key: "imageStatus", label: "Image status (when no image records)", type: "select", options: IMAGE_STATUSES.map((s) => ({ value: s, label: IMAGE_LABELS[s] })) },
    { key: "notes", label: "Internal notes", type: "textarea", span: 2 },
  ];
  const enFields: FieldSpec[] = [
    { key: "nameEn", label: "English title", span: 2, maxLength: 80, compareTo: p.rmsName, compareLabel: "RMS", issues: issuesFor("nameEn"),
      hint: "Brand + Product type + Variant/Flavor[, Spec] - Size" },
    { key: "volumeWeightEn", label: "Size / pack (EN)", hint: "e.g. 500 g · 1.5 Liters · Pack of 12 · 10 x 250 g", issues: issuesFor("volumeWeightEn") },
    { key: "shortDescriptionEn", label: "Short description (EN)" },
    { key: "descriptionEn", label: "English description", type: "textarea", span: 2, issues: issuesFor("descriptionEn") },
  ];
  const arFields: FieldSpec[] = [
    { key: "nameAr", label: "Arabic title", dir: "rtl", span: 2, maxLength: 80, compareTo: p.rmsName, compareLabel: "RMS", issues: issuesFor("nameAr"),
      hint: "العلامة التجارية + نوع المنتج + النكهة/النوع - الحجم" },
    { key: "volumeWeightAr", label: "Size / pack (AR)", dir: "rtl", hint: "مثال: 500 جم · 1.5 لتر · عبوة من 12", issues: issuesFor("volumeWeightAr") },
    { key: "shortDescriptionAr", label: "Short description (AR)", dir: "rtl" },
    { key: "descriptionAr", label: "Arabic description", type: "textarea", dir: "rtl", span: 2, issues: issuesFor("descriptionAr") },
  ];
  const sizeHint = props.size.ok
    ? props.size.kind === "WEIGHT"
      ? `Size "${props.size.input}" → ${props.size.suggestedWeightKg} kg${p.weightKg != null && p.weightKg !== props.size.suggestedWeightKg ? " (differs from current weight)" : ""}`
      : props.size.kind === "VOLUME"
        ? `Size "${props.size.input}" is a volume/capacity – physical weight is NOT derived automatically; enter the real weight if Magento needs it.`
        : `Size "${props.size.input}" is a ${props.size.kind?.toLowerCase()} – no weight derived.`
    : "Size not parseable yet.";
  const specFields: FieldSpec[] = [
    { key: "weightKg", label: "Physical weight (kg) – Magento weight", type: "number", hint: sizeHint, issues: issuesFor("weightKg") },
    { key: "dimensions", label: "Dimensions" },
    { key: "model", label: "Model" },
    { key: "color", label: "Color" },
    { key: "flavor", label: "Flavor" },
    { key: "variant", label: "Variant" },
    { key: "origin", label: "Country of origin" },
  ];
  const seoFields: FieldSpec[] = [
    { key: "urlKey", label: "URL key", span: 2, issues: issuesFor("urlKey") },
    { key: "metaTitleEn", label: "Meta title (EN)", maxLength: 70, issues: issuesFor("metaTitleEn") },
    { key: "metaTitleAr", label: "Meta title (AR)", dir: "rtl", maxLength: 70, issues: issuesFor("metaTitleAr") },
    { key: "metaDescriptionEn", label: "Meta description (EN)", type: "textarea", maxLength: 160 },
    { key: "metaDescriptionAr", label: "Meta description (AR)", type: "textarea", dir: "rtl", maxLength: 160 },
    { key: "visibility", label: "Visibility", type: "select", options: ["Not Visible Individually", "Catalog", "Search", "Catalog, Search"].map((v) => ({ value: v, label: v })) },
    { key: "productOnline", label: "Product online", type: "checkbox" },
    { key: "storeViewCode", label: "Store view code" },
    { key: "magentoProductType", label: "Magento product type" },
    { key: "attributeSetCode", label: "Magento attribute set code" },
    { key: "magentoId", label: "Magento product ID", type: "number" },
    { key: "relatedSkus", label: "Related SKUs", span: 2 },
    { key: "crosssellSkus", label: "Cross-sell SKUs", span: 2 },
    { key: "upsellSkus", label: "Up-sell SKUs", span: 2 },
    { key: "additionalAttributes", label: "Additional attributes (extra, besides brand & mapped attributes)", span: 2 },
  ];
  const commentFieldOptions = [...overviewFields, ...enFields, ...arFields, ...specFields, ...seoFields, { key: "brandId", label: "Brand" }, { key: "primaryCategoryId", label: "Category" }, { key: "images", label: "Images" }]
    .map((f) => ({ value: f.key, label: f.label }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="border-b bg-card px-5 py-2.5">
        <div className="flex flex-wrap items-start gap-3">
          <Link href="/products" className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Back to products"><ChevronLeft className="size-4" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{p.sku}</span>
              {p.brand && <span>· {p.brand.name}</span>}
              {p.primaryCategory && <span className="truncate">· {p.primaryCategory.path.replace(/\//g, " › ")}</span>}
            </div>
            <h1 className="truncate text-base font-semibold">{p.nameEn ?? <span className="italic text-muted-foreground">{p.rmsName ?? "Untitled"}</span>}</h1>
            <div dir="rtl" className="truncate text-right text-sm text-muted-foreground">{p.nameAr ?? "—"}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <QcBadge outcome={p.qcOutcome} score={p.qcScore} />
            <CompletenessBar value={ev.completeness.percent} />
            <PriorityBadge priority={p.priority} />
            {p.dueDate && <span className={cn("text-xs", isOverdue(p.dueDate, done) ? "font-medium text-red-600" : "text-muted-foreground")}>Due {fmtDate(p.dueDate)}</span>}
            {perms.editable.nameEn !== false && <HeaderActions productId={p.id} />}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        {/* main */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="sticky top-0 z-10 bg-card">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="en">English content</TabsTrigger>
              <TabsTrigger value="ar">Arabic content</TabsTrigger>
              <TabsTrigger value="specs">Specifications</TabsTrigger>
              <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
              <TabsTrigger value="attributes">Attributes</TabsTrigger>
              <TabsTrigger value="seo">SEO & Magento</TabsTrigger>
              <TabsTrigger value="compare">RMS / PIM / Magento</TabsTrigger>
              <TabsTrigger value="qc">QC reviews</TabsTrigger>
              <TabsTrigger value="history">History ({props.history.length})</TabsTrigger>
            </TabsList>
            <div className="p-5">
              <TabsContent value="overview" className="space-y-5">
                <DuplicatesNotice dup={ev.duplicates} />
                <BrandEditor productId={p.id} brandId={p.brandId} brands={props.options.brands} canEdit={perms.editable.brandId !== false} rmsBrand={p.rmsBrand} />
                <FieldForm fields={overviewFields} {...common} />
              </TabsContent>
              <TabsContent value="en"><FieldForm fields={enFields} {...common} /></TabsContent>
              <TabsContent value="ar"><div dir="rtl" className="[&_label]:text-right"><div dir="ltr"><FieldForm fields={arFields} {...common} /></div></div></TabsContent>
              <TabsContent value="specs" className="space-y-4">
                <SizeReadout size={props.size} packCount={p.packCount} sizeKind={p.sizeKind} />
                <FieldForm fields={specFields} {...common} />
              </TabsContent>
              <TabsContent value="taxonomy">
                <TaxonomyEditor product={p} lineage={ev.lineage} options={props.options} canEdit={perms.editable.primaryCategoryId !== false} />
              </TabsContent>
              <TabsContent value="attributes">
                <AttributesEditor productId={p.id} attributes={props.attributes} values={props.attributeValues} canEdit={perms.editable.nameEn !== false} />
              </TabsContent>
              <TabsContent value="seo" className="space-y-3">
                <p className="text-xs text-muted-foreground">Use “Generate” (header) to fill empty URL key / meta titles from titles – existing values are never overwritten.</p>
                <FieldForm fields={seoFields} {...common} />
              </TabsContent>
              <TabsContent value="compare" className="space-y-4">
                <CompareTable rows={props.comparison} rmsAt={props.rmsSnapshotAt} magentoAt={props.magentoSnapshotAt} />
                <div>
                  <h3 className="mb-1 text-xs font-semibold">Latest RMS re-import changes</h3>
                  {props.rmsChanges.length === 0 ? <p className="text-xs text-muted-foreground">No differences between the last two RMS snapshots.</p> : (
                    <Table><THead><tr><TH>Field</TH><TH>Previous RMS</TH><TH>Latest RMS</TH></tr></THead>
                      <TBody>{props.rmsChanges.map((c) => <TR key={c.field}><TD>{fieldLabel(c.field)}</TD><TD dir="auto">{String(c.before ?? "—")}</TD><TD dir="auto" className="bg-amber-50">{String(c.after ?? "—")}</TD></TR>)}</TBody></Table>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="qc">
                <Table><THead><tr><TH>When</TH><TH>Reviewer</TH><TH>Decision</TH><TH>Outcome</TH><TH>Notes</TH></tr></THead>
                  <TBody>
                    {props.reviews.length === 0 && <EmptyRow colSpan={5}>No QC reviews yet.</EmptyRow>}
                    {props.reviews.map((r) => (
                      <TR key={r.id}><TD className="whitespace-nowrap">{fmtDate(r.createdAt, true)}</TD><TD>{r.reviewer}</TD><TD><Badge tone={r.decision === "APPROVED" ? "green" : "red"}>{r.decision}</Badge></TD>
                        <TD><QcBadge outcome={r.outcome} score={r.score} /></TD><TD className="max-w-md">{r.notes}</TD></TR>
                    ))}
                  </TBody>
                </Table>
              </TabsContent>
              <TabsContent value="history"><HistoryTable rows={props.history} /></TabsContent>
            </div>
          </Tabs>
        </div>

        {/* right panel */}
        <aside className="w-[340px] shrink-0 overflow-y-auto border-l bg-card max-lg:w-full max-lg:border-l-0 max-lg:border-t">
          <WorkflowPanel productId={p.id} status={p.status} previousStatus={p.previousStatus} statusChangedAt={p.statusChangedAt} transitions={props.transitions} />
          <FlagsList flags={props.flags} />
          <CompletenessPanel completeness={ev.completeness} />
          <QcPanel qc={ev.qc} productId={p.id} canQc={perms.qc} />
          <ImagesPanel images={p.images} productId={p.sku} imageStatus={p.imageStatus} />
          <Panel title="People">
            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-xs">
              <dt className="text-muted-foreground">Owner</dt><dd>{p.owner?.name ?? "Unassigned"}</dd>
              <dt className="text-muted-foreground">QC reviewer</dt><dd>{p.qcReviewer?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Campaign</dt><dd>{p.campaign ?? "—"}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{fmtDate(p.createdAt, true)}</dd>
              <dt className="text-muted-foreground">Updated</dt><dd>{fmtDate(p.updatedAt, true)}</dd>
            </dl>
          </Panel>
          <CommentsPanel productId={p.id} comments={props.comments} fieldKey={commentField} setFieldKey={setCommentField} fields={commentFieldOptions}
            canComment={perms.comment} users={props.users} />
          <Panel title="Recent history">
            <ul className="space-y-1">
              {props.history.slice(0, 8).map((h) => (
                <li key={h.id} className="text-[11px] leading-4"><span className="font-medium">{h.actor}</span> {describe(h)} <span className="text-muted-foreground">· {fmtDate(h.createdAt, true)}</span></li>
              ))}
            </ul>
            <button className="mt-1 text-xs text-primary hover:underline" onClick={() => setTab("history")}>Full history →</button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function describe(h: Props["history"][number]): string {
  if (h.action === "STATUS_CHANGE") return `moved ${h.oldValue ?? ""} → ${h.newValue}`;
  if (h.action === "UPDATE") return `changed ${fieldLabel(h.field ?? "")}`;
  if (h.action === "CREATE") return "created the product";
  return h.action.toLowerCase().replace(/_/g, " ");
}

function HeaderActions({ productId }: { productId: string }) {
  const { pending, result, run } = useAction();
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => generateDerivedAction(productId))} title="Fill empty URL key, meta titles, sizes and weight from titles/size"><Sparkles />Generate</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recomputeAction(productId))} title="Re-run QC and completeness"><RefreshCw />Re-check</Button>
      {result && <Feedback result={result} className="max-w-xs" />}
    </div>
  );
}

function DuplicatesNotice({ dup }: { dup: QcDuplicates }) {
  const items = [
    ...(dup.barcode ?? []).map((s) => `barcode shared with ${s}`),
    ...(dup.nameEn ?? []).map((s) => `same English title as ${s}`),
    ...(dup.nameAr ?? []).map((s) => `same Arabic title as ${s}`),
    ...(dup.urlKey ?? []).map((s) => `same URL key as ${s}`),
    ...(dup.similarNameEn ?? []).map((s) => `very similar title to ${s}`),
  ];
  if (!items.length) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <b>Possible duplicates</b> – nothing is deleted automatically: {items.join(" · ")}
    </div>
  );
}

function BrandEditor({ productId, brandId, brands, canEdit, rmsBrand }: { productId: string; brandId: string | null; brands: { id: string; name: string }[]; canEdit: boolean; rmsBrand: string | null }) {
  const [value, setValue] = useState(brandId ?? "");
  const [newBrand, setNewBrand] = useState("");
  const { pending, result, run } = useAction();
  return (
    <div className="flex flex-wrap items-end gap-2 rounded border bg-slate-50/60 p-3">
      <div className="w-64">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Brand</div>
        <NativeSelect disabled={!canEdit} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">— No brand —</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
      </div>
      <Button size="sm" disabled={!canEdit || pending || value === (brandId ?? "")} onClick={() => run(() => updateProductAction(productId, { brandId: value || null }))}>Save brand</Button>
      {canEdit && (
        <>
          <Input className="h-8 w-44" placeholder="New brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <Button size="sm" variant="outline" disabled={pending || !newBrand.trim()} onClick={() => run(async () => {
            const r = await upsertBrandAction(newBrand);
            if (r.ok && r.id) { await updateProductAction(productId, { brandId: r.id }); setNewBrand(""); }
            return r;
          })}>Create & assign</Button>
        </>
      )}
      {rmsBrand && <span className="text-[11px] text-muted-foreground">RMS brand: {rmsBrand}</span>}
      <Feedback result={result} className="w-full" />
    </div>
  );
}

function SizeReadout({ size, packCount, sizeKind }: { size: Props["size"]; packCount: number | null; sizeKind: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded border bg-slate-50/60 p-3 text-xs md:grid-cols-5">
      <div><div className="text-[10px] uppercase text-muted-foreground">Parsed kind</div><div className="font-medium">{size.ok ? size.kind : "—"}</div></div>
      <div><div className="text-[10px] uppercase text-muted-foreground">Per item</div><div className="font-medium">{size.value != null ? `${size.value} ${size.unit}` : "—"}</div></div>
      <div><div className="text-[10px] uppercase text-muted-foreground">Pack count</div><div className="font-medium">{size.ok ? size.packCount : packCount ?? "—"}</div></div>
      <div><div className="text-[10px] uppercase text-muted-foreground">Total</div><div className="font-medium">{size.total != null ? `${size.total} ${size.unit}` : "—"}</div></div>
      <div><div className="text-[10px] uppercase text-muted-foreground">Weight from size</div><div className="font-medium">{size.suggestedWeightKg != null ? `${size.suggestedWeightKg} kg` : sizeKind === "VOLUME" || size.kind === "VOLUME" ? "n/a (volume)" : "—"}</div></div>
    </div>
  );
}

function TaxonomyEditor({ product, lineage, options, canEdit }: { product: ProductData; lineage: { id: string; name: string; path: string }[]; options: Props["options"]; canEdit: boolean }) {
  const [primary, setPrimary] = useState(product.primaryCategoryId ?? "");
  const [setId, setSetId] = useState(product.attributeSetId ?? "");
  const [extra, setExtra] = useState<string[]>(product.categories.map((c) => c.categoryId));
  const [filter, setFilter] = useState("");
  const { pending, result, run } = useAction();
  const cats = options.categories.filter((c) => !filter || c.path.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">Breadcrumb: {lineage.length ? lineage.map((l) => l.name).join(" › ") : "—"}</div>
      <Input placeholder="Filter categories…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">Primary category</div>
          <NativeSelect disabled={!canEdit} value={primary} onChange={(e) => setPrimary(e.target.value)} size={12} className="h-auto py-1">
            <option value="">— none —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
          </NativeSelect>
          <div className="mt-2 flex items-center gap-2">
            <NativeSelect disabled={!canEdit} value={setId} onChange={(e) => setSetId(e.target.value)} className="w-56">
              <option value="">— attribute set —</option>
              {options.attributeSets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
            <Button size="sm" disabled={!canEdit || pending} onClick={() => run(() => updateProductAction(product.id, { primaryCategoryId: primary || null, attributeSetId: setId || null }))}>Save</Button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">Additional categories (e.g. campaigns, Top Offers)</div>
          <div className="h-[252px] overflow-y-auto rounded border p-1.5">
            {cats.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 py-0.5 text-xs">
                <input type="checkbox" disabled={!canEdit} checked={extra.includes(c.id)} onChange={(e) => setExtra(e.target.checked ? [...extra, c.id] : extra.filter((x) => x !== c.id))} />
                {c.path.replace(/\//g, " › ")}
              </label>
            ))}
          </div>
          <Button size="sm" className="mt-2" disabled={!canEdit || pending} onClick={() => run(() => setAdditionalCategoriesAction(product.id, extra))}>Save additional ({extra.length})</Button>
        </div>
      </div>
      <Feedback result={result} />
    </div>
  );
}

function AttributesEditor({ productId, attributes, values, canEdit }: { productId: string; attributes: AttrDef[]; values: Props["attributeValues"]; canEdit: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const list = attributes.filter((a) => showAll || a.inSet || values.some((v) => v.attributeId === a.id));
  const groups = Array.from(new Set(list.map((a) => a.group)));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Dynamic attributes come from the attribute set and category rules. <b>Required</b> ones count toward completeness.</p>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Show all attributes</label>
      </div>
      {list.length === 0 && <p className="text-xs text-muted-foreground">No attributes apply – assign an attribute set or category.</p>}
      {groups.map((g) => (
        <div key={g}>
          <h3 className="mb-2 text-xs font-semibold">{g}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {list.filter((a) => a.group === g).flatMap((a) => (a.localized ? ["en", "ar"] : ["all"]).map((loc) => (
              <AttributeInput key={`${a.id}-${loc}`} productId={productId} attr={a} locale={loc} canEdit={canEdit}
                value={values.find((v) => v.attributeId === a.id && v.locale === loc)?.value} />
            )))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttributeInput({ productId, attr, locale, value, canEdit }: { productId: string; attr: AttrDef; locale: string; value: unknown; canEdit: boolean }) {
  const init = Array.isArray(value) ? value : value == null ? (attr.type === "MULTISELECT" ? [] : "") : attr.type === "BOOLEAN" ? String(value) : String(value);
  const [v, setV] = useState<string | string[]>(init as string | string[]);
  const { pending, result, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  return (
    <div className="rounded border p-2">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">{attr.label}{locale !== "all" && ` (${locale.toUpperCase()})`}{attr.unit && ` · ${attr.unit}`}</span>
        <span className="flex gap-1">{attr.required && <Badge tone="red">Required</Badge>}<Badge>{attr.type}</Badge></span>
      </div>
      {attr.type === "DROPDOWN" ? (
        <NativeSelect disabled={!canEdit} value={v as string} onChange={(e) => setV(e.target.value)}>
          <option value="">—</option>{attr.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      ) : attr.type === "MULTISELECT" ? (
        <div className="flex flex-wrap gap-2">
          {attr.options.map((o) => (
            <label key={o.value} className="flex items-center gap-1 text-xs">
              <input type="checkbox" disabled={!canEdit} checked={(v as string[]).includes(o.value)}
                onChange={(e) => setV(e.target.checked ? [...(v as string[]), o.value] : (v as string[]).filter((x) => x !== o.value))} />{o.label}
            </label>
          ))}
        </div>
      ) : attr.type === "BOOLEAN" ? (
        <NativeSelect disabled={!canEdit} value={v as string} onChange={(e) => setV(e.target.value)}>
          <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
        </NativeSelect>
      ) : (
        <Input disabled={!canEdit} dir={locale === "ar" ? "rtl" : undefined} type={attr.type === "NUMBER" ? "number" : attr.type === "DATE" ? "date" : "text"} step="any"
          value={v as string} onChange={(e) => setV(e.target.value)} />
      )}
      {attr.helpText && <div className="mt-1 text-[11px] text-muted-foreground">{attr.helpText}</div>}
      {canEdit && dirty && (
        <Button size="xs" className="mt-1.5" disabled={pending} onClick={() => run(() => setAttributeAction(productId, attr.id, locale, attr.type === "BOOLEAN" ? (v === "" ? null : v === "true") : v))}>Save</Button>
      )}
      <Feedback result={result} className="mt-1" />
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function CompareTable({ rows, rmsAt, magentoAt }: { rows: Props["comparison"]; rmsAt: Date | null; magentoAt: Date | null }) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">RMS snapshot {rmsAt ? fmtDate(rmsAt, true) : "—"} · Magento snapshot {magentoAt ? fmtDate(magentoAt, true) : "none (not linked yet)"}</p>
      <Table>
        <THead><tr><TH>Field</TH><TH>RMS</TH><TH>PIM (current)</TH><TH>Magento</TH><TH>State</TH></tr></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.key}>
              <TD className="whitespace-nowrap font-medium">{r.label}</TD>
              <TD dir="auto" className="max-w-[200px] truncate text-muted-foreground">{fmt(r.rms)}</TD>
              <TD dir="auto" className="max-w-[260px] truncate">{fmt(r.pim)}</TD>
              <TD dir="auto" className={cn("max-w-[260px] truncate", r.state === "CHANGED" && "bg-amber-50", r.state === "CONFLICT" && "bg-red-50")}>{fmt(r.magento)}</TD>
              <TD><Badge tone={STATE_TONE[r.state]} title={r.note}>{r.state}</Badge> <span className="text-[11px] text-muted-foreground">{r.note}</span></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function HistoryTable({ rows }: { rows: Props["history"] }) {
  const [f, setF] = useState("");
  const list = rows.filter((r) => !f || [r.action, r.field, r.actor, r.newValue, r.oldValue].join(" ").toLowerCase().includes(f.toLowerCase()));
  return (
    <div className="space-y-2">
      <Input className="max-w-xs" placeholder="Filter history…" value={f} onChange={(e) => setF(e.target.value)} />
      <Table>
        <THead><tr><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Field</TH><TH>Old value</TH><TH>New value</TH><TH>Source</TH><TH>Reason</TH></tr></THead>
        <TBody>
          {list.length === 0 && <EmptyRow colSpan={8}>No history.</EmptyRow>}
          {list.map((h) => (
            <TR key={h.id}>
              <TD className="whitespace-nowrap tabular">{fmtDate(h.createdAt, true)}</TD>
              <TD className="whitespace-nowrap">{h.actor}</TD>
              <TD><Badge>{h.action}</Badge></TD>
              <TD className="whitespace-nowrap">{h.field ? fieldLabel(h.field) : "—"}</TD>
              <TD dir="auto" className="max-w-[220px] truncate text-muted-foreground" title={h.oldValue ?? ""}>{h.oldValue ?? "—"}</TD>
              <TD dir="auto" className="max-w-[220px] truncate" title={h.newValue ?? ""}>{h.newValue ?? "—"}</TD>
              <TD><Badge tone="slate">{h.source}</Badge></TD>
              <TD className="max-w-[200px] truncate text-muted-foreground">{h.reason ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
