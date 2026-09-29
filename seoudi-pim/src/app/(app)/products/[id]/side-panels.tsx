"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, CircleAlert, MessageSquare, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CompletenessBar, ImageBadge, QcBadge, StatusBadge } from "@/components/pim/badges";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { addCommentAction, resolveCommentAction, transitionAction } from "@/app/actions/products";
import { STAGES, STAGE_LABELS, type CompletenessResult } from "@/lib/domain/completeness";
import type { QcResult } from "@/lib/domain/qc";
import { STATUS_LABELS, type WorkflowStatus } from "@/lib/domain/workflow";
import { QC_OUTCOME_TONE } from "@/lib/domain/qc";
import { fieldLabel } from "@/lib/labels";
import { cn, fmtDate, relTime } from "@/lib/utils";

export function Panel({ title, children, actions, className }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b px-3 py-2.5", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export interface TransitionOption {
  target: WorkflowStatus;
  label: string;
  reasonRequired: boolean;
  blockers: string[];
}

export function WorkflowPanel({ productId, status, previousStatus, statusChangedAt, transitions }: {
  productId: string; status: string; previousStatus: string | null; statusChangedAt: Date; transitions: TransitionOption[];
}) {
  const [reason, setReason] = useState("");
  const { pending, result, run } = useAction();
  return (
    <Panel title="Workflow">
      <div className="mb-2 flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-[11px] text-muted-foreground">since {relTime(statusChangedAt)}</span>
      </div>
      {status === "BLOCKED" && previousStatus && (
        <div className="mb-2 text-[11px] text-muted-foreground">Resumes to {STATUS_LABELS[previousStatus as WorkflowStatus]}</div>
      )}
      {transitions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No transitions available for your role.</p>
      ) : (
        <div className="space-y-1.5">
          {transitions.map((t) => {
            const blocked = t.blockers.length > 0;
            return (
              <div key={t.target} className="rounded border px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-medium">{t.label}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowRight className="size-3" />{STATUS_LABELS[t.target]}</div>
                  </div>
                  <Button size="xs" variant={blocked ? "outline" : t.target === "QC_REJECTED" || t.target === "BLOCKED" ? "destructive" : "default"}
                    disabled={pending || blocked || (t.reasonRequired && reason.trim().length < 3)}
                    onClick={() => run(() => transitionAction(productId, t.target, reason || undefined), () => setReason(""))}>
                    Move
                  </Button>
                </div>
                {blocked && <ul className="mt-1 space-y-0.5">{t.blockers.map((b, i) => <li key={i} className="flex gap-1 text-[11px] text-red-600"><CircleAlert className="mt-px size-3 shrink-0" />{b}</li>)}</ul>}
                {!blocked && t.reasonRequired && <div className="mt-1 text-[11px] text-amber-700">Reason required</div>}
              </div>
            );
          })}
          <Input className="h-7 text-xs" placeholder="Reason / note for the transition" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <Feedback result={result} className="mt-2" />
    </Panel>
  );
}

export function CompletenessPanel({ completeness }: { completeness: CompletenessResult }) {
  return (
    <Panel title="Completeness" actions={<span className="tabular text-xs font-semibold">{completeness.percent}%</span>}>
      <div className="space-y-1.5">
        {STAGES.map((s) => {
          const b = completeness.byStage[s];
          if (!b.required) return null;
          return (
            <div key={s}>
              <div className="flex items-center justify-between text-xs">
                <span>{STAGE_LABELS[s]}</span>
                <span className="tabular text-muted-foreground">{b.filled}/{b.required}</span>
              </div>
              <CompletenessBar value={b.percent} className="[&>div:first-child]:w-full" />
              {b.missing.length > 0 && <div className="text-[11px] text-red-600">Missing: {b.missing.join(", ")}</div>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Required fields come from workflow stage, attribute set and category rules.</p>
    </Panel>
  );
}

export function QcPanel({ qc, productId, canQc }: { qc: QcResult; productId: string; canQc: boolean }) {
  return (
    <Panel title="Automated QC" actions={<QcBadge outcome={qc.outcome} score={qc.score} />}>
      {qc.issues.length === 0 ? (
        <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" />All QC rules pass</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {qc.issues.map((i, n) => (
            <li key={n} className="text-[11.5px] leading-4">
              <Badge tone={QC_OUTCOME_TONE[i.outcome]} className="mr-1 px-1 py-0 text-[10px]">{i.outcome === "NEEDS_REVIEW" ? "REVIEW" : i.outcome}</Badge>
              <span className="font-medium">{fieldLabel(i.field)}</span> – {i.message}
            </li>
          ))}
        </ul>
      )}
      {canQc && <Link href={`/qc/${productId}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open QC review →</Link>}
    </Panel>
  );
}

export function ImagesPanel({ images, productId, imageStatus }: { images: { id: string; url: string | null; role: string; status: string }[]; productId: string; imageStatus: string }) {
  return (
    <Panel title="Images" actions={<ImageBadge status={imageStatus} />}>
      {images.length === 0 ? <p className="text-xs text-muted-foreground">No images yet.</p> : (
        <div className="flex flex-wrap gap-1.5">
          {images.map((i) => (
            <div key={i.id} className="relative" title={`${i.role} · ${i.status}`}>
              {i.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.url} alt="" className={cn("size-14 rounded border object-cover", i.role === "MAIN" && "ring-2 ring-primary/50")} />
              ) : <div className="grid size-14 place-items-center rounded border border-dashed text-[9px] text-muted-foreground">{i.status}</div>}
            </div>
          ))}
        </div>
      )}
      <Link href={`/images?q=${productId}`} className="mt-2 inline-block text-xs text-primary hover:underline">Manage images →</Link>
    </Panel>
  );
}

export interface CommentView {
  id: string; body: string; fieldKey: string | null; parentId: string | null; resolved: boolean; author: string; resolvedBy: string | null;
  resolvedAt: Date | null; createdAt: Date;
}

export function CommentsPanel({ productId, comments, fieldKey, setFieldKey, fields, canComment, users }: {
  productId: string; comments: CommentView[]; fieldKey: string; setFieldKey: (k: string) => void; fields: { value: string; label: string }[];
  canComment: boolean; users: string[];
}) {
  const [body, setBody] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const { pending, result, run } = useAction();
  const roots = comments.filter((c) => !c.parentId && (showResolved || !c.resolved));
  const replies = (id: string) => comments.filter((c) => c.parentId === id);
  const open = comments.filter((c) => !c.parentId && !c.resolved).length;
  return (
    <Panel title={`Comments (${open} open)`} actions={
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />resolved</label>}>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {roots.length === 0 && <p className="text-xs text-muted-foreground">No comments.</p>}
        {roots.map((c) => (
          <Comment key={c.id} c={c} replies={replies(c.id)} productId={productId} canComment={canComment} />
        ))}
      </div>
      {canComment && (
        <div className="mt-2 space-y-1.5">
          <NativeSelect className="h-7 text-xs" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)}>
            <option value="">General comment</option>
            {fields.map((f) => <option key={f.value} value={f.value}>Field: {f.label}</option>)}
          </NativeSelect>
          <Textarea rows={2} placeholder={`Comment… mention with @Name (${users.slice(0, 2).map((u) => "@" + u).join(", ")}…)`} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-12 text-xs" />
          <Button size="xs" disabled={pending || !body.trim()} onClick={() => run(() => addCommentAction(productId, body, fieldKey || null), () => setBody(""))}>
            <MessageSquare />Comment
          </Button>
          <Feedback result={result} />
        </div>
      )}
    </Panel>
  );
}

function Comment({ c, replies, productId, canComment }: { c: CommentView; replies: CommentView[]; productId: string; canComment: boolean }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <div className={cn("rounded border p-2 text-xs", c.resolved ? "bg-slate-50 opacity-70" : "bg-card")}>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="font-medium">{c.author}</span>
        <span className="text-[10px] text-muted-foreground" title={fmtDate(c.createdAt, true)}>{relTime(c.createdAt)}</span>
      </div>
      {c.fieldKey && <Badge tone="amber" className="mb-1 text-[10px]">{fieldLabel(c.fieldKey)}</Badge>}
      <p className="whitespace-pre-wrap leading-4" dir="auto">{c.body}</p>
      {replies.map((r) => (
        <div key={r.id} className="mt-1.5 border-l-2 pl-2">
          <div className="text-[11px] font-medium">{r.author} <span className="font-normal text-muted-foreground">· {relTime(r.createdAt)}</span></div>
          <p className="whitespace-pre-wrap" dir="auto">{r.body}</p>
        </div>
      ))}
      {c.resolved && <div className="mt-1 text-[10px] text-emerald-700">Resolved by {c.resolvedBy} · {fmtDate(c.resolvedAt, true)}</div>}
      {canComment && (
        <div className="mt-1.5 flex items-center gap-2">
          <button className="text-[11px] text-primary hover:underline" onClick={() => setOpen(!open)}>Reply</button>
          <button className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground" disabled={pending}
            onClick={() => run(() => resolveCommentAction(c.id, !c.resolved))}>
            {c.resolved ? <><RotateCcw className="size-3" />Reopen</> : <><Check className="size-3" />Resolve</>}
          </button>
        </div>
      )}
      {open && (
        <div className="mt-1.5 flex gap-1">
          <Input className="h-7 text-xs" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
          <Button size="xs" disabled={pending || !reply.trim()} onClick={() => run(() => addCommentAction(productId, reply, c.fieldKey, c.id), () => { setReply(""); setOpen(false); })}>Send</Button>
        </div>
      )}
    </div>
  );
}

export function FlagsList({ flags }: { flags: { id: string; fieldKey: string; message: string; severity: string; suspected: boolean; resolved: boolean; createdBy: string; createdAt: Date }[] }) {
  const open = flags.filter((f) => !f.resolved);
  if (!open.length) return null;
  return (
    <Panel title={`QC flags (${open.length} open)`} className="bg-red-50/40">
      <ul className="space-y-1">
        {open.map((f) => (
          <li key={f.id} className="flex gap-1 text-[11.5px]">
            <XCircle className="mt-0.5 size-3 shrink-0 text-red-600" />
            <span><span className="font-medium">{fieldLabel(f.fieldKey)}</span>{f.suspected && <Badge tone="violet" className="mx-1 text-[10px]">Suspected</Badge>}: {f.message}
              <span className="text-muted-foreground"> — {f.createdBy}, {relTime(f.createdAt)}</span></span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
