"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { createCategoryAction, moveCategoryAction, setCategoryActiveAction, updateCategoryAction } from "@/app/actions/taxonomy";
import { cn, fmtDate } from "@/lib/utils";

interface Node {
  id: string; name: string; nameAr: string | null; parentId: string | null; path: string; depth: number; active: boolean; magentoId: number | null;
  attributeSetId: string | null; attributeSet: string | null; sortOrder: number; products: number; requiredAttrs: number;
}

export function TaxonomyManager({ nodes, sets, history, canManage }: {
  nodes: Node[]; sets: { id: string; name: string }[];
  history: { id: string; entityId: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; reason: string | null; actor: string; createdAt: Date }[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const children = useMemo(() => {
    const m = new Map<string | null, Node[]>();
    for (const n of nodes) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    for (const v of m.values()) v.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return m;
  }, [nodes]);
  const subtreeCount = useMemo(() => {
    const memo = new Map<string, number>();
    const f = (id: string): number => memo.get(id) ?? (memo.set(id, (nodes.find((n) => n.id === id)?.products ?? 0) + (children.get(id) ?? []).reduce((a, c) => a + f(c.id), 0)), memo.get(id)!);
    nodes.forEach((n) => f(n.id));
    return memo;
  }, [nodes, children]);
  const sel = nodes.find((n) => n.id === selected) ?? null;
  const q = filter.trim().toLowerCase();
  const matches = (n: Node) => !q || n.path.toLowerCase().includes(q) || (n.nameAr ?? "").includes(filter.trim());

  const render = (parentId: string | null): React.ReactNode =>
    (children.get(parentId) ?? []).filter((n) => showInactive || n.active).map((n) => {
      const kids = children.get(n.id) ?? [];
      const isOpen = open.has(n.id) || !!q;
      if (q && !matches(n) && !nodes.some((d) => d.path.startsWith(n.path + "/") && matches(d))) return null;
      return (
        <div key={n.id}>
          <div className={cn("flex items-center gap-1 rounded px-1 py-0.5 text-[12.5px] hover:bg-muted", selected === n.id && "bg-accent", !n.active && "opacity-50")} style={{ paddingLeft: n.depth * 14 + 4 }}>
            <button className="grid size-4 place-items-center text-muted-foreground" onClick={() => { const s = new Set(open); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); setOpen(s); }} aria-label="Toggle">
              {kids.length ? (isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />) : null}
            </button>
            <button className="flex-1 truncate text-left" onClick={() => setSelected(n.id)}>{n.name}{n.nameAr && <bdi className="ml-2 text-muted-foreground">{n.nameAr}</bdi>}</button>
            {!n.active && <Badge tone="slate">inactive</Badge>}
            {n.magentoId && <span className="tabular text-[10px] text-muted-foreground">#{n.magentoId}</span>}
            <span className="tabular w-8 text-right text-[11px] text-muted-foreground">{subtreeCount.get(n.id) || ""}</span>
          </div>
          {isOpen && render(n.id)}
        </div>
      );
    });

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,1fr)_1.2fr]">
      <div className="flex min-h-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b p-2">
          <Input className="h-7 text-xs" placeholder="Filter (EN/AR)…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />inactive</label>
          <Button size="xs" variant="ghost" onClick={() => setOpen(new Set(nodes.map((n) => n.id)))}>Expand</Button>
          <Button size="xs" variant="ghost" onClick={() => setOpen(new Set())}>Collapse</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">{render(null)}</div>
        {canManage && <NewCategory parentId={null} label="New top-level category" />}
      </div>
      <div className="min-h-0 overflow-y-auto p-5">
        {!sel ? <p className="text-sm text-muted-foreground">Select a category to edit, move, deactivate or add children.</p> : (
          <NodeEditor key={sel.id} node={sel} nodes={nodes} sets={sets} canManage={canManage} history={history.filter((h) => h.entityId === sel.id)} products={subtreeCount.get(sel.id) ?? 0} />
        )}
        <h3 className="mb-1 mt-6 text-xs font-semibold">Recent taxonomy changes</h3>
        <HistoryTable rows={history.slice(0, 30)} nodes={nodes} />
      </div>
    </div>
  );
}

function NewCategory({ parentId, label }: { parentId: string | null; label: string }) {
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const { pending, result, run } = useAction();
  return (
    <div className="space-y-1.5 border-t p-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="flex gap-1">
        <Input className="h-7 text-xs" placeholder="Name (EN)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-7 text-xs" dir="rtl" placeholder="الاسم" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        <Button size="xs" disabled={pending || !name.trim()} onClick={() => run(() => createCategoryAction(parentId, name, nameAr), () => { setName(""); setNameAr(""); })}><FolderPlus />Add</Button>
      </div>
      <Feedback result={result} />
    </div>
  );
}

function NodeEditor({ node, nodes, sets, canManage, history, products }: { node: Node; nodes: Node[]; sets: { id: string; name: string }[]; canManage: boolean; history: Parameters<typeof HistoryTable>[0]["rows"]; products: number }) {
  const [name, setName] = useState(node.name);
  const [nameAr, setNameAr] = useState(node.nameAr ?? "");
  const [magentoId, setMagentoId] = useState(node.magentoId ? String(node.magentoId) : "");
  const [setId, setSetId] = useState(node.attributeSetId ?? "");
  const [sortOrder, setSortOrder] = useState(String(node.sortOrder));
  const [parent, setParent] = useState(node.parentId ?? "");
  const [reason, setReason] = useState("");
  const { pending, result, run } = useAction();
  const validParents = nodes.filter((n) => n.id !== node.id && !n.path.startsWith(node.path + "/"));
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">Default Category / {node.path.replace(/\//g, " / ")}</div>
        <h2 className="text-base font-semibold">{node.name} {!node.active && <Badge>inactive</Badge>}</h2>
        <div className="text-xs text-muted-foreground">{products} products in subtree · attribute set: {node.attributeSet ?? "inherited / none"} · {node.requiredAttrs} category attribute rule(s) ·{" "}
          <Link className="text-primary hover:underline" href={`/products?category=${node.id}`}>view products</Link></div>
      </div>
      <fieldset disabled={!canManage} className="grid gap-3 md:grid-cols-2">
        <div><Label>Name (EN)</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Name (AR)</Label><Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></div>
        <div><Label>Magento category ID</Label><Input type="number" value={magentoId} onChange={(e) => setMagentoId(e.target.value)} /></div>
        <div><Label>Attribute set</Label>
          <NativeSelect value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">— inherit / none —</option>{sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></div>
        <div><Label>Sort order</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></div>
        <div className="flex items-end"><Button size="sm" disabled={pending} onClick={() => run(() => updateCategoryAction(node.id, { name, nameAr, magentoId, attributeSetId: setId, sortOrder }))}>Save changes</Button></div>
      </fieldset>
      {canManage && (
        <div className="grid gap-3 rounded border p-3 md:grid-cols-2">
          <div>
            <Label>Move under</Label>
            <div className="flex gap-1">
              <NativeSelect value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">— top level —</option>
                {validParents.map((n) => <option key={n.id} value={n.id}>{n.path.replace(/\//g, " › ")}</option>)}
              </NativeSelect>
              <Button size="sm" variant="outline" disabled={pending || parent === (node.parentId ?? "")} onClick={() => run(() => moveCategoryAction(node.id, parent || null))}>Move</Button>
            </div>
          </div>
          <div>
            <Label>{node.active ? "Deactivate (with children)" : "Reactivate"}</Label>
            <div className="flex gap-1">
              <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" variant={node.active ? "destructive" : "outline"} disabled={pending} onClick={() => run(() => setCategoryActiveAction(node.id, !node.active, reason))}>{node.active ? "Deactivate" : "Reactivate"}</Button>
            </div>
          </div>
        </div>
      )}
      <Feedback result={result} />
      {canManage && <div className="rounded border"><NewCategory parentId={node.id} label={`Add child under "${node.name}"`} /></div>}
      <div>
        <h3 className="mb-1 text-xs font-semibold">History of this node</h3>
        <HistoryTable rows={history} nodes={nodes} />
      </div>
    </div>
  );
}

function HistoryTable({ rows, nodes }: { rows: { id: string; entityId: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; reason: string | null; actor: string; createdAt: Date }[]; nodes: Node[] }) {
  return (
    <div className="rounded border bg-card">
      <Table>
        <THead><tr><TH>When</TH><TH>Who</TH><TH>Category</TH><TH>Action</TH><TH>Old</TH><TH>New</TH><TH>Reason</TH></tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={7}>No changes recorded.</EmptyRow>}
          {rows.map((h) => (
            <TR key={h.id}>
              <TD className="whitespace-nowrap">{fmtDate(h.createdAt, true)}</TD><TD>{h.actor}</TD>
              <TD className="max-w-[180px] truncate">{nodes.find((n) => n.id === h.entityId)?.name ?? "—"}</TD>
              <TD><Badge>{h.action}</Badge></TD>
              <TD className="max-w-[160px] truncate text-muted-foreground">{h.oldValue ?? "—"}</TD><TD className="max-w-[160px] truncate">{h.newValue ?? "—"}</TD>
              <TD className="text-muted-foreground">{h.reason ?? ""}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
