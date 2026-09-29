"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { ImageBadge, PriorityBadge, StatusBadge } from "@/components/pim/badges";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { requestImagesAction, saveImageAction } from "@/app/actions/images";
import { IMAGE_LABELS, IMAGE_STATUSES, type ImageStatusT } from "@/lib/labels";

interface Row {
  id: string; sku: string; nameEn: string | null; nameAr: string | null; rmsName: string | null; status: string; imageStatus: string; priority: string;
  images: { id: string; url: string | null; role: string; status: string; notes: string | null }[];
}

export function ImagesTable({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ImageStatusT>("REQUESTED");
  const { pending, result, run } = useAction();
  return (
    <div className="bg-card">
      {canManage && sel.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-emerald-50 px-5 py-2 text-xs">
          <b>{sel.length} selected</b>
          <NativeSelect className="h-7 w-44 text-xs" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ImageStatusT)}>
            {IMAGE_STATUSES.filter((s) => s !== "READY" && s !== "AVAILABLE").map((s) => <option key={s} value={s}>{IMAGE_LABELS[s]}</option>)}
          </NativeSelect>
          <Button size="xs" disabled={pending} onClick={() => run(() => requestImagesAction(sel, bulkStatus), () => setSel([]))}>Set main image status</Button>
          <Feedback result={result} />
        </div>
      )}
      <Table>
        <THead><tr>
          <TH className="w-8"><input type="checkbox" aria-label="Select all" checked={sel.length === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} /></TH>
          <TH>SKU</TH><TH>Product</TH><TH>Workflow</TH><TH>Priority</TH><TH>Image status</TH><TH>Main image</TH><TH>Additional</TH>{canManage && <TH className="w-[420px]">Update main image</TH>}
        </tr></THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={9}>No products.</EmptyRow>}
          {rows.map((r) => {
            const main = r.images.find((i) => i.role === "MAIN");
            const extra = r.images.filter((i) => i.role !== "MAIN");
            return (
              <TR key={r.id}>
                <TD><input type="checkbox" aria-label={`Select ${r.sku}`} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></TD>
                <TD className="font-mono text-[12px]"><Link href={`/products/${r.id}`} className="text-primary hover:underline">{r.sku}</Link></TD>
                <TD className="max-w-[260px]"><div className="truncate">{r.nameEn ?? r.rmsName}</div><div dir="rtl" className="truncate text-right text-[11px] text-muted-foreground">{r.nameAr}</div></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD><PriorityBadge priority={r.priority} /></TD>
                <TD><ImageBadge status={r.imageStatus} /></TD>
                <TD>
                  {main?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={main.url} target="_blank" rel="noreferrer"><img src={main.url} alt="" className="size-12 rounded border object-cover" /></a>
                  ) : <div className="grid size-12 place-items-center rounded border border-dashed text-[9px] text-muted-foreground">{main?.status ?? "none"}</div>}
                </TD>
                <TD>
                  <div className="flex gap-1">
                    {extra.map((i) => i.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i.id} src={i.url} alt="" className="size-8 rounded border object-cover" title={i.status} />
                    ) : <span key={i.id} className="text-[10px]">{i.status}</span>)}
                    {canManage && <AddExtra productId={r.id} />}
                  </div>
                </TD>
                {canManage && <TD><MainEditor productId={r.id} image={main} /></TD>}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

function MainEditor({ productId, image }: { productId: string; image?: Row["images"][number] }) {
  const [url, setUrl] = useState(image?.url ?? "");
  const [status, setStatus] = useState<ImageStatusT>((image?.status as ImageStatusT) ?? "REQUESTED");
  const { pending, result, run } = useAction();
  const dirty = url !== (image?.url ?? "") || status !== (image?.status ?? "REQUESTED");
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input className="h-7 text-xs" placeholder="https://… image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <NativeSelect className="h-7 w-32 text-xs" value={status} onChange={(e) => setStatus(e.target.value as ImageStatusT)}>
          {IMAGE_STATUSES.map((s) => <option key={s} value={s}>{IMAGE_LABELS[s]}</option>)}
        </NativeSelect>
        <Button size="xs" disabled={pending || !dirty} onClick={() => run(() => saveImageAction({ productId, imageId: image?.id, url, role: "MAIN", status }))}>Save</Button>
      </div>
      {result && !result.ok && <Feedback result={result} />}
    </div>
  );
}

function AddExtra({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const { pending, result, run } = useAction();
  if (!open) return <button className="grid size-8 place-items-center rounded border border-dashed text-muted-foreground hover:bg-muted" title="Add additional image" onClick={() => setOpen(true)}><Plus className="size-3" /></button>;
  return (
    <div className="flex items-center gap-1">
      <Input className="h-7 w-40 text-xs" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Button size="xs" disabled={pending || !url} onClick={() => run(() => saveImageAction({ productId, url, role: "ADDITIONAL", status: "READY" }), () => { setOpen(false); setUrl(""); })}>Add</Button>
      {result && !result.ok && <Feedback result={result} />}
    </div>
  );
}
