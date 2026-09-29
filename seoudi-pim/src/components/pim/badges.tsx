import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_TONE, type WorkflowStatus } from "@/lib/domain/workflow";
import { QC_OUTCOME_TONE, type QcOutcome } from "@/lib/domain/qc";
import { IMAGE_LABELS, IMAGE_TONE, PRIORITY_TONE, QC_LABELS, type ImageStatusT, type PriorityT } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const s = status as WorkflowStatus;
  return <Badge tone={STATUS_TONE[s] ?? "slate"}>{STATUS_LABELS[s] ?? status}</Badge>;
}

export function QcBadge({ outcome, score }: { outcome: string | null | undefined; score?: number | null }) {
  if (!outcome) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <Badge tone={QC_OUTCOME_TONE[outcome as QcOutcome] ?? "slate"}>
      {QC_LABELS[outcome] ?? outcome}
      {score != null && <span className="tabular opacity-70">{score}</span>}
    </Badge>
  );
}

export function ImageBadge({ status }: { status: string }) {
  return <Badge tone={IMAGE_TONE[status as ImageStatusT] ?? "slate"}>{IMAGE_LABELS[status as ImageStatusT] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "NORMAL") return <span className="text-[11px] text-muted-foreground">Normal</span>;
  return <Badge tone={PRIORITY_TONE[priority as PriorityT] ?? "slate"}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</Badge>;
}

export function CompletenessBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 100 ? "bg-emerald-500" : value >= 75 ? "bg-teal-500" : value >= 50 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className={cn("flex items-center gap-1.5", className)} title={`${value}% complete`}>
      <div className="h-1.5 w-14 overflow-hidden rounded bg-slate-200">
        <div className={cn("h-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="tabular w-8 text-[11px] text-muted-foreground">{value}%</span>
    </div>
  );
}
