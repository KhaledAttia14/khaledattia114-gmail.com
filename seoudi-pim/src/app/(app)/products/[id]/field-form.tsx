"use client";
import { useMemo, useState } from "react";
import { MessageSquare, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { updateProductAction } from "@/app/actions/products";
import { cn } from "@/lib/utils";

export interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "date" | "checkbox" | "skuList";
  options?: { value: string; label: string }[];
  dir?: "rtl" | "ltr";
  hint?: React.ReactNode;
  /** value from RMS / source to compare with */
  compareTo?: string | null;
  compareLabel?: string;
  span?: 1 | 2;
  maxLength?: number;
  list?: string;
  issues?: string[];
}

export function toInputValue(v: unknown, type: FieldSpec["type"]): string | boolean {
  if (type === "checkbox") return !!v;
  if (v == null) return "";
  if (type === "date") return new Date(v as string).toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function FieldForm({ productId, fields, values, editable, onComment, commentCounts, columns = 2 }: {
  productId: string;
  fields: FieldSpec[];
  values: Record<string, unknown>;
  editable: Record<string, boolean>;
  onComment?: (fieldKey: string) => void;
  commentCounts?: Record<string, number>;
  columns?: 1 | 2;
}) {
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, toInputValue(values[f.key], f.type)])), [fields, values]);
  const [state, setState] = useState<Record<string, string | boolean>>(initial);
  // re-sync with server values after a save/refresh without remounting (keeps feedback visible)
  const initialKey = JSON.stringify(initial);
  const [baseline, setBaseline] = useState(initialKey);
  if (baseline !== initialKey) {
    setBaseline(initialKey);
    setState(initial);
  }
  const [reason, setReason] = useState("");
  const { pending, result, run, setResult } = useAction();
  const dirty = fields.filter((f) => state[f.key] !== initial[f.key]).map((f) => f.key);

  const save = () => {
    const patch: Record<string, unknown> = {};
    for (const k of dirty) patch[k] = state[k];
    run(() => updateProductAction(productId, patch, reason || undefined), () => setReason(""));
  };

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-x-4 gap-y-3", columns === 2 ? "md:grid-cols-2" : "grid-cols-1")}>
        {fields.map((f) => {
          const canEdit = editable[f.key] !== false;
          const v = state[f.key];
          const changed = dirty.includes(f.key);
          const differs = f.compareTo != null && f.compareTo !== "" && typeof v === "string" && v.trim() !== String(f.compareTo).trim();
          const cc = commentCounts?.[f.key] ?? 0;
          return (
            <div key={f.key} className={cn("min-w-0", f.span === 2 && "md:col-span-2")}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor={`f-${f.key}`} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}{changed && <span className="ml-1 text-amber-600">• edited</span>}
                </label>
                <div className="flex items-center gap-2">
                  {f.maxLength && typeof v === "string" && (
                    <span className={cn("tabular text-[10px]", v.length > f.maxLength ? "text-red-600" : "text-muted-foreground")}>{v.length}/{f.maxLength}</span>
                  )}
                  {onComment && (
                    <button type="button" onClick={() => onComment(f.key)} title="Comment on this field"
                      className={cn("inline-flex items-center gap-0.5 text-[10px] hover:text-foreground", cc ? "text-amber-600" : "text-muted-foreground/60")}>
                      <MessageSquare className="size-3" />{cc > 0 && cc}
                    </button>
                  )}
                </div>
              </div>
              {f.type === "textarea" ? (
                <Textarea id={`f-${f.key}`} dir={f.dir} disabled={!canEdit} value={v as string} rows={4}
                  onChange={(e) => setState({ ...state, [f.key]: e.target.value })} className={cn(f.dir === "rtl" && "text-right")} />
              ) : f.type === "select" ? (
                <NativeSelect id={`f-${f.key}`} disabled={!canEdit} value={v as string} onChange={(e) => setState({ ...state, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              ) : f.type === "checkbox" ? (
                <label className="flex h-8 items-center gap-2 text-[13px]">
                  <input id={`f-${f.key}`} type="checkbox" disabled={!canEdit} checked={!!v} onChange={(e) => setState({ ...state, [f.key]: e.target.checked })} />
                  {v ? "Yes" : "No"}
                </label>
              ) : (
                <Input id={`f-${f.key}`} dir={f.dir} disabled={!canEdit} list={f.list}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step={f.type === "number" ? "any" : undefined}
                  value={v as string} onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
                  className={cn(f.dir === "rtl" && "text-right", differs && "border-amber-300 bg-amber-50/40")} />
              )}
              {f.compareTo != null && f.compareTo !== "" && (
                <div className={cn("mt-1 truncate text-[11px]", differs ? "text-amber-700" : "text-muted-foreground")} dir="auto" title={String(f.compareTo)}>
                  {f.compareLabel ?? "RMS"}: {String(f.compareTo)} {differs ? "· differs" : "· same"}
                </div>
              )}
              {f.hint && <div className="mt-1 text-[11px] text-muted-foreground">{f.hint}</div>}
              {f.issues?.map((i, n) => <div key={n} className="mt-0.5 text-[11px] text-red-600">⚠ {i}</div>)}
            </div>
          );
        })}
      </div>
      {fields.some((f) => editable[f.key] !== false) && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" disabled={!dirty.length || pending} onClick={save}><Save />{pending ? "Saving…" : `Save${dirty.length ? ` (${dirty.length})` : ""}`}</Button>
          <Button size="sm" variant="ghost" disabled={!dirty.length} onClick={() => { setState(initial); setResult(null); }}><Undo2 />Discard</Button>
          <Input className="h-7 max-w-xs text-xs" placeholder="Change reason (optional, stored in history)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Feedback result={result} />
        </div>
      )}
    </div>
  );
}
