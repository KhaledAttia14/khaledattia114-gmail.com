import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { compareField, COMPARE_FIELDS, type CompareState } from "@/lib/domain/compare";
import { similarity } from "@/lib/domain/text";
import { can } from "@/lib/domain/rbac";
import { PageHeader } from "@/components/pim/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/pim/badges";
import { fieldLabel } from "@/lib/labels";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Reports" };

const TABS = [["compare", "RMS vs PIM vs Magento"], ["duplicates", "Duplicates & risks"], ["throughput", "Throughput"], ["audit", "Audit log"]] as const;
const STATE_TONE: Record<CompareState, Tone> = { SAME: "green", CHANGED: "amber", MISSING: "slate", CONFLICT: "red" };

type SP = { tab?: string; state?: string; entity?: string; actor?: string; action?: string; q?: string; page?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab ?? "compare";
  return (
    <div>
      <PageHeader title="Reports" description="Cross-system comparison, duplicate detection, team throughput and the complete audit trail." />
      <div className="flex gap-1 border-b bg-card px-5">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/reports?tab=${k}`} className={cn("-mb-px border-b-2 px-2.5 py-2 text-[12.5px]", tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</Link>
        ))}
      </div>
      <div className="p-5">
        {tab === "compare" && <CompareReport state={sp.state} />}
        {tab === "duplicates" && <DuplicatesReport />}
        {tab === "throughput" && <Throughput />}
        {tab === "audit" && (can(user.role, "audit.view") ? <AuditLog sp={sp} /> : <p className="text-sm text-muted-foreground">Your role cannot view the audit log.</p>)}
      </div>
    </div>
  );
}

async function CompareReport({ state }: { state?: string }) {
  const products = await db.product.findMany({
    where: { magentoSnapshots: { some: {} } },
    select: {
      id: true, sku: true, nameEn: true, status: true, nameAr: true, volumeWeightEn: true, volumeWeightAr: true, weightKg: true, urlKey: true, visibility: true,
      productOnline: true, metaTitleEn: true, metaTitleAr: true, updatedAt: true, brand: { select: { name: true } }, primaryCategory: { select: { path: true } },
      categories: { select: { category: { select: { path: true } } } },
      magentoSnapshots: { orderBy: { createdAt: "asc" }, select: { data: true, createdAt: true, source: true } },
      rmsSnapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { data: true } },
    },
    take: 1000,
  });
  const rows = products.map((p) => {
    const mag: Record<string, unknown> = Object.assign({}, ...p.magentoSnapshots.map((s) => s.data as Record<string, unknown>));
    const rms = (p.rmsSnapshots[0]?.data as Record<string, unknown>) ?? {};
    const pim: Record<string, unknown> = { ...p, brand: p.brand?.name, categories: [p.primaryCategory?.path, ...p.categories.map((c) => c.category.path)].filter(Boolean) };
    const fields = COMPARE_FIELDS.map((f) => ({ key: f.key, ...compareField({ rms: f.rmsKey ? rms[f.rmsKey] : undefined, pim: pim[f.key], magento: mag[f.key] }) }));
    const count = (s: CompareState) => fields.filter((f) => f.state === s).length;
    return { p, fields, same: count("SAME"), changed: count("CHANGED"), missing: count("MISSING"), conflict: count("CONFLICT") };
  });
  const filtered = rows.filter((r) => !state || (state === "CHANGED" ? r.changed : state === "CONFLICT" ? r.conflict : state === "MISSING" ? r.missing : r.changed + r.conflict + r.missing === 0));
  const totals = { SAME: rows.filter((r) => r.changed + r.conflict + r.missing === 0).length, CHANGED: rows.filter((r) => r.changed).length, MISSING: rows.filter((r) => r.missing).length, CONFLICT: rows.filter((r) => r.conflict).length };
  return (
    <Card>
      <CardHeader title={`Products with Magento data (${rows.length})`} actions={
        <div className="flex gap-1 text-xs">
          <Link href="/reports?tab=compare" className={cn("rounded px-2 py-0.5", !state ? "bg-primary text-white" : "bg-slate-100")}>All</Link>
          {(["SAME", "CHANGED", "MISSING", "CONFLICT"] as CompareState[]).map((s) => (
            <Link key={s} href={`/reports?tab=compare&state=${s}`} className={cn("rounded px-2 py-0.5", state === s ? "bg-primary text-white" : "bg-slate-100")}>{s} {totals[s]}</Link>
          ))}
        </div>} />
      <Table>
        <THead><tr><TH>SKU</TH><TH>Product</TH><TH>Status</TH><TH className="text-right">Same</TH><TH className="text-right">Changed</TH><TH className="text-right">Missing</TH><TH className="text-right">Conflict</TH><TH>Differing fields</TH></tr></THead>
        <TBody>
          {filtered.length === 0 && <EmptyRow colSpan={8}>No products for this state.</EmptyRow>}
          {filtered.map(({ p, fields, same, changed, missing, conflict }) => (
            <TR key={p.id}>
              <TD className="font-mono text-[12px]"><Link className="text-primary hover:underline" href={`/products/${p.id}`}>{p.sku}</Link></TD>
              <TD className="max-w-[260px] truncate">{p.nameEn}</TD>
              <TD><StatusBadge status={p.status} /></TD>
              <TD className="tabular text-right text-emerald-700">{same}</TD><TD className="tabular text-right text-amber-700">{changed || ""}</TD>
              <TD className="tabular text-right text-muted-foreground">{missing || ""}</TD><TD className="tabular text-right font-medium text-red-600">{conflict || ""}</TD>
              <TD><div className="flex flex-wrap gap-1">{fields.filter((f) => f.state !== "SAME").map((f) => <Badge key={f.key} tone={STATE_TONE[f.state]} title={f.note}>{fieldLabel(f.key)}</Badge>)}</div></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function DuplicatesReport() {
  const [barcodes, urls, names, short, all] = await Promise.all([
    db.$queryRaw<{ v: string; skus: string[] }[]>`SELECT barcode AS v, array_agg(sku) AS skus FROM "Product" WHERE barcode IS NOT NULL GROUP BY barcode HAVING count(*) > 1`,
    db.$queryRaw<{ v: string; skus: string[] }[]>`SELECT "urlKey" AS v, array_agg(sku) AS skus FROM "Product" WHERE "urlKey" IS NOT NULL GROUP BY "urlKey" HAVING count(*) > 1`,
    db.$queryRaw<{ v: string; skus: string[] }[]>`SELECT lower("nameEn") AS v, array_agg(sku) AS skus FROM "Product" WHERE "nameEn" IS NOT NULL GROUP BY lower("nameEn") HAVING count(*) > 1`,
    db.product.findMany({ where: { sku: { startsWith: "" } }, select: { id: true, sku: true, nameEn: true } }).then((ps) => ps.filter((p) => /^\d{11}$/.test(p.sku))),
    db.product.findMany({ where: { nameEn: { not: null } }, select: { id: true, sku: true, nameEn: true, brandId: true } }),
  ]);
  // similar titles within the same brand
  const similar: { a: string; b: string; na: string; nb: string; score: number }[] = [];
  const byBrand = new Map<string, typeof all>();
  for (const p of all) if (p.brandId) byBrand.set(p.brandId, [...(byBrand.get(p.brandId) ?? []), p]);
  for (const list of byBrand.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const s = similarity(list[i].nameEn!, list[j].nameEn!);
      if (s >= 0.9 && s < 1) similar.push({ a: list[i].sku, b: list[j].sku, na: list[i].nameEn!, nb: list[j].nameEn!, score: s });
    }
  }
  similar.sort((x, y) => y.score - x.score);
  const Block = ({ title, rows }: { title: string; rows: { v: string; skus: string[] }[] }) => (
    <Card>
      <CardHeader title={`${title} (${rows.length})`} />
      <Table><THead><tr><TH>Value</TH><TH>SKUs</TH></tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={2}>None found.</EmptyRow>}
          {rows.map((r) => <TR key={r.v}><TD className="max-w-[360px] truncate" dir="auto">{r.v}</TD><TD className="font-mono text-[12px]">{r.skus.map((s) => <Link key={s} className="mr-2 text-primary hover:underline" href={`/search?q=${s}`}>{s}</Link>)}</TD></TR>)}
        </TBody>
      </Table>
    </Card>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Warnings only – the PIM never deletes or merges records automatically. Resolve by editing the affected SKUs.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Block title="Duplicate barcodes" rows={barcodes} />
        <Block title="Duplicate URL keys" rows={urls} />
        <Block title="Identical English titles" rows={names} />
        <Card>
          <CardHeader title={`Similar titles within a brand (${similar.length})`} />
          <Table><THead><tr><TH>SKU A</TH><TH>SKU B</TH><TH>Titles</TH><TH className="text-right">Similarity</TH></tr></THead>
            <TBody>
              {similar.length === 0 && <EmptyRow colSpan={4}>None found.</EmptyRow>}
              {similar.slice(0, 50).map((s) => (
                <TR key={s.a + s.b}><TD className="font-mono text-[12px]">{s.a}</TD><TD className="font-mono text-[12px]">{s.b}</TD>
                  <TD className="max-w-[380px] text-[11.5px]"><div className="truncate">{s.na}</div><div className="truncate text-muted-foreground">{s.nb}</div></TD>
                  <TD className="tabular text-right">{(s.score * 100).toFixed(0)}%</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={`11-digit SKUs – leading zero possibly lost by Excel (${short.length})`} />
          <Table><TBody>
            {short.length === 0 && <EmptyRow colSpan={2}>None found.</EmptyRow>}
            {short.map((p) => <TR key={p.id}><TD className="font-mono text-[12px]"><Link className="text-primary" href={`/products/${p.id}`}>{p.sku}</Link></TD><TD>{p.nameEn}</TD></TR>)}
          </TBody></Table>
        </Card>
      </div>
    </div>
  );
}

async function Throughput() {
  const since = new Date(Date.now() - 14 * 86400_000);
  const moves = await db.auditLog.findMany({ where: { action: "STATUS_CHANGE", createdAt: { gte: since } }, select: { createdAt: true, newValue: true, actor: { select: { name: true } } } });
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10));
  const actors = Array.from(new Set(moves.map((m) => m.actor?.name ?? "System")));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const targets = ["READY_FOR_QC", "QC_APPROVED", "QC_REJECTED", "LIVE", "COMPLETED"];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Status changes per day (last 14 days)" />
        <Table>
          <THead><tr><TH>Actor</TH>{days.map((d) => <TH key={d} className="text-right">{d.slice(5)}</TH>)}<TH className="text-right">Total</TH></tr></THead>
          <TBody>
            {actors.map((a) => {
              const mine = moves.filter((m) => (m.actor?.name ?? "System") === a);
              return <TR key={a}><TD className="whitespace-nowrap">{a}</TD>{days.map((d) => { const n = mine.filter((m) => key(m.createdAt) === d).length; return <TD key={d} className={cn("tabular text-right", !n && "text-slate-300")}>{n}</TD>; })}<TD className="tabular text-right font-medium">{mine.length}</TD></TR>;
            })}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Milestones reached (last 14 days)" />
        <Table>
          <THead><tr><TH>Milestone</TH>{days.map((d) => <TH key={d} className="text-right">{d.slice(5)}</TH>)}</tr></THead>
          <TBody>
            {targets.map((t) => <TR key={t}><TD><StatusBadge status={t} /></TD>{days.map((d) => { const n = moves.filter((m) => m.newValue === t && key(m.createdAt) === d).length; return <TD key={d} className={cn("tabular text-right", !n && "text-slate-300")}>{n}</TD>; })}</TR>)}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

async function AuditLog({ sp }: { sp: SP }) {
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.q ? { OR: [{ field: { contains: sp.q } }, { newValue: { contains: sp.q } }, { oldValue: { contains: sp.q } }, { product: { sku: { contains: sp.q } } }] } : {}),
  };
  const [rows, total, entities, actions, users] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { name: true } }, product: { select: { id: true, sku: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100 }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
    db.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const qs = (patch: Partial<SP>) => `/reports?${new URLSearchParams(Object.entries({ ...sp, tab: "audit", ...patch }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <Card>
      <CardHeader title={`Audit log (${total.toLocaleString()} entries)`} />
      <form className="flex flex-wrap items-center gap-1.5 border-b p-2 text-xs" action="/reports">
        <input type="hidden" name="tab" value="audit" />
        <select name="entity" defaultValue={sp.entity ?? ""} className="h-7 rounded border px-1"><option value="">All entities</option>{entities.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType} ({e._count._all})</option>)}</select>
        <select name="action" defaultValue={sp.action ?? ""} className="h-7 rounded border px-1"><option value="">All actions</option>{actions.map((a) => <option key={a.action} value={a.action}>{a.action} ({a._count._all})</option>)}</select>
        <select name="actor" defaultValue={sp.actor ?? ""} className="h-7 rounded border px-1"><option value="">All actors</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <input name="q" defaultValue={sp.q} placeholder="SKU / field / value" className="h-7 w-48 rounded border px-2" />
        <button className="h-7 rounded bg-primary px-2 text-white">Filter</button>
      </form>
      <Table>
        <THead><tr><TH>Timestamp</TH><TH>Actor</TH><TH>Entity</TH><TH>SKU</TH><TH>Action</TH><TH>Field</TH><TH>Old value</TH><TH>New value</TH><TH>Source</TH><TH>Reason</TH></tr></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="tabular whitespace-nowrap">{fmtDate(r.createdAt, true)}</TD>
              <TD className="whitespace-nowrap">{r.actor?.name ?? "System"}</TD>
              <TD>{r.entityType}</TD>
              <TD className="font-mono text-[12px]">{r.product ? <Link className="text-primary hover:underline" href={`/products/${r.product.id}`}>{r.product.sku}</Link> : "—"}</TD>
              <TD><Badge>{r.action}</Badge></TD>
              <TD>{r.field ? fieldLabel(r.field) : "—"}</TD>
              <TD dir="auto" className="max-w-[200px] truncate text-muted-foreground" title={r.oldValue ?? ""}>{r.oldValue ?? "—"}</TD>
              <TD dir="auto" className="max-w-[220px] truncate" title={r.newValue ?? ""}>{r.newValue ?? "—"}</TD>
              <TD><Badge tone="slate">{r.source}</Badge></TD>
              <TD className="max-w-[180px] truncate text-muted-foreground" title={r.reason ?? ""}>{r.reason ?? ""}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="flex justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
        <span>Page {page} of {Math.max(1, Math.ceil(total / 100))}</span>
        <span className="flex gap-3">{page > 1 && <Link className="text-primary" href={qs({ page: String(page - 1) })}>Prev</Link>}{page * 100 < total && <Link className="text-primary" href={qs({ page: String(page + 1) })}>Next</Link>}</span>
      </div>
    </Card>
  );
}
