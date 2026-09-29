import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "slate" | "blue" | "amber" | "violet" | "green" | "red" | "orange" | "teal";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function Badge({ tone = "slate", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}
      {...props}
    />
  );
}
