"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { createAttributeSetAction, saveAttributeAction, setAttributeSetItemAction, setCategoryAttributeAction } from "@/app/actions/attributes";

interface Attr {
  id: string; code: string; label: string; labelAr: string | null; type: string; options: { value: string; label: string }[]; unit: string | null;
  localized: boolean; group: string; magentoCode: string | null; helpText: string | null; active: boolean; validation: Record<string, number>; usage: number;
}
interface AttrSet { id: string; code: string; name: string; magentoCode: string; products: number; categories: number; items: { attributeId: string; required: boolean }[] }
interface CatRule { categoryId: string; path: string; attributeId: string; code: string; label: string; required: boolean }

const TYPES = ["TEXT", "NUMBER", "DROPDOWN", "MULTISELECT", "BOOLEAN", "DATE"];

export function AttributesAdmin({ attrs, sets, catRules, categories, canManage }: { attrs: Attr[]; sets: AttrSet[]; catRules: CatRule[]; categories: { id: string; path: string }[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Attr | "new" | null>(null);
  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardHeader title={`Attribute definitions (${attrs.length})`} actions={canManage && <Button size="sm" onClick={() => setEditing("new")}><Plus />New attribute</Button>} />
        <Table>
          <THead><tr><TH>Code</TH><TH>Label</TH><TH>Label (AR)</TH><TH>Type</TH><TH>Options / rules</TH><TH>Unit</TH><TH>Group</TH><TH>Magento code</TH><TH className="text-right">Values</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {attrs.map((a) => (
              <TR key={a.id}>
                <TD className="font-mono text-[12px]">{a.code}</TD><TD>{a.label}{a.localized && <Badge className="ml-1">EN/AR</Badge>}</TD>
                <TD dir="rtl" className="text-right">{a.labelAr ?? "—"}</TD><TD><Badge tone="blue">{a.type}</Badge></TD>
                <TD className="max-w-[260px] truncate text-muted-foreground">{a.options.length ? a.options.map((o) => o.label).join(", ") : Object.entries(a.validation).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}</TD>
                <TD>{a.unit ?? "—"}</TD><TD>{a.group}</TD><TD className="font-mono text-[12px]">{a.magentoCode ?? "—"}</TD>
                <TD className="tabular text-right">{a.usage}</TD>
                <TD>{a.active ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD>{canManage && <Button size="icon" variant="ghost" onClick={() => setEditing(a)} aria-label={`Edit ${a.code}`}><Pencil /></Button>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <DialogContent title={editing === "new" ? "New attribute" : `Edit ${editing.code}`} className="max-w-2xl"><AttrForm attr={editing === "new" ? null : editing} onDone={() => setEditing(null)} /></DialogContent>}
      </Dialog>

      <SetsMatrix attrs={attrs} sets={sets} canManage={canManage} />
      <CategoryRules attrs={attrs} rules={catRules} categories={categories} canManage={canManage} />
    </div>
  );
}

function AttrForm({ attr, onDone }: { attr: Attr | null; onDone: () => void }) {
  const [f, setF] = useState({
    code: attr?.code ?? "", label: attr?.label ?? "", labelAr: attr?.labelAr ?? "", type: attr?.type ?? "TEXT",
    options: attr?.options.map((o) => (o.value === o.label ? o.value : `${o.value}|${o.label}`)).join("\n") ?? "", unit: attr?.unit ?? "",
    localized: attr?.localized ?? false, group: attr?.group ?? "Specifications", magentoCode: attr?.magentoCode ?? "", helpText: attr?.helpText ?? "",
    min: attr?.validation.min?.toString() ?? "", max: attr?.validation.max?.toString() ?? "", maxLength: attr?.validation.maxLength?.toString() ?? "", active: attr?.active ?? true,
  });
  const { pending, result, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div><Label>Code</Label><Input value={f.code} onChange={set("code")} disabled={!!attr} placeholder="e.g. shade_number" /></div>
      <div><Label>Type</Label><NativeSelect value={f.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</NativeSelect></div>
      <div><Label>Label (EN)</Label><Input value={f.label} onChange={set("label")} /></div>
      <div><Label>Label (AR)</Label><Input dir="rtl" value={f.labelAr} onChange={set("labelAr")} /></div>
      <div><Label>Group</Label><Input value={f.group} onChange={set("group")} /></div>
      <div><Label>Unit</Label><Input value={f.unit} onChange={set("unit")} placeholder="e.g. W, L" /></div>
      <div><Label>Magento attribute code</Label><Input value={f.magentoCode} onChange={set("magentoCode")} placeholder="exported in additional_attributes" /></div>
      <div className="flex items-end gap-4 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.localized} onChange={set("localized")} />Localized (EN + AR values)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.active} onChange={set("active")} />Active</label>
      </div>
      {(f.type === "DROPDOWN" || f.type === "MULTISELECT") && (
        <div className="md:col-span-2"><Label>Options (one per line, value|label)</Label><Textarea rows={5} value={f.options} onChange={set("options")} /></div>
      )}
      {f.type === "NUMBER" && (<><div><Label>Min</Label><Input type="number" value={f.min} onChange={set("min")} /></div><div><Label>Max</Label><Input type="number" value={f.max} onChange={set("max")} /></div></>)}
      {f.type === "TEXT" && <div><Label>Max length</Label><Input type="number" value={f.maxLength} onChange={set("maxLength")} /></div>}
      <div className="md:col-span-2"><Label>Help text</Label><Input value={f.helpText} onChange={set("helpText")} /></div>
      <div className="md:col-span-2 flex items-center gap-2">
        <Button disabled={pending} onClick={() => run(() => saveAttributeAction({ ...f, id: attr?.id, type: f.type as never }), onDone)}>Save attribute</Button>
        <Feedback result={result} />
      </div>
    </div>
  );
}

function SetsMatrix({ attrs, sets, canManage }: { attrs: Attr[]; sets: AttrSet[]; canManage: boolean }) {
  const { pending, result, run } = useAction();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const state = (s: AttrSet, a: Attr) => { const i = s.items.find((x) => x.attributeId === a.id); return i ? (i.required ? "required" : "optional") : "remove"; };
  return (
    <Card>
      <CardHeader title="Attribute sets (required / optional per set)"
        actions={canManage && (
          <div className="flex items-center gap-1">
            <Input className="h-7 w-28 text-xs" placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Input className="h-7 w-40 text-xs" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="xs" disabled={pending || !code} onClick={() => run(() => createAttributeSetAction(code, name, "Default"), () => { setCode(""); setName(""); })}><Plus />Add set</Button>
          </div>
        )} />
      <Table>
        <THead><tr><TH>Attribute</TH>{sets.map((s) => <TH key={s.id} className="text-center">{s.name}<div className="font-normal normal-case">{s.products} products · Magento “{s.magentoCode}”</div></TH>)}</tr></THead>
        <TBody>
          {attrs.filter((a) => a.active).map((a) => (
            <TR key={a.id}>
              <TD><span className="font-mono text-[12px]">{a.code}</span> <span className="text-muted-foreground">{a.label}</span></TD>
              {sets.map((s) => (
                <TD key={s.id} className="text-center">
                  <NativeSelect disabled={!canManage || pending} className="mx-auto h-7 w-28 text-xs" value={state(s, a)}
                    onChange={(e) => run(() => setAttributeSetItemAction(s.id, a.id, e.target.value as never))}>
                    <option value="remove">—</option><option value="optional">Optional</option><option value="required">Required</option>
                  </NativeSelect>
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="p-2"><Feedback result={result} /></div>
    </Card>
  );
}

function CategoryRules({ attrs, rules, categories, canManage }: { attrs: Attr[]; rules: CatRule[]; categories: { id: string; path: string }[]; canManage: boolean }) {
  const [cat, setCat] = useState("");
  const [attr, setAttr] = useState("");
  const [mode, setMode] = useState<"required" | "optional">("required");
  const { pending, result, run } = useAction();
  return (
    <Card>
      <CardHeader title="Category-specific attributes (apply to the category and all its children)" />
      {canManage && (
        <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
          <NativeSelect className="h-7 w-80 text-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Category…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}
          </NativeSelect>
          <NativeSelect className="h-7 w-56 text-xs" value={attr} onChange={(e) => setAttr(e.target.value)}>
            <option value="">Attribute…</option>{attrs.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.label} ({a.code})</option>)}
          </NativeSelect>
          <NativeSelect className="h-7 w-28 text-xs" value={mode} onChange={(e) => setMode(e.target.value as "required" | "optional")}>
            <option value="required">Required</option><option value="optional">Optional</option>
          </NativeSelect>
          <Button size="xs" disabled={pending || !cat || !attr} onClick={() => run(() => setCategoryAttributeAction(cat, attr, mode))}><Plus />Add rule</Button>
          <Feedback result={result} />
        </div>
      )}
      <Table>
        <THead><tr><TH>Category</TH><TH>Attribute</TH><TH>Rule</TH><TH /></tr></THead>
        <TBody>
          {rules.length === 0 && <EmptyRow colSpan={4}>No category-specific rules.</EmptyRow>}
          {rules.map((r) => (
            <TR key={`${r.categoryId}-${r.attributeId}`}>
              <TD>{r.path.replace(/\//g, " › ")}</TD><TD>{r.label} <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span></TD>
              <TD>{r.required ? <Badge tone="red">Required</Badge> : <Badge>Optional</Badge>}</TD>
              <TD>{canManage && <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setCategoryAttributeAction(r.categoryId, r.attributeId, "remove"))}>Remove</Button>}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
