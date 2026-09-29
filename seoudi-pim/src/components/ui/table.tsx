import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom border-collapse text-[12.5px]", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-slate-50", className)} {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b last:border-0 hover:bg-slate-50/70 data-[selected=true]:bg-emerald-50/60", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-8 whitespace-nowrap border-b px-2 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-2 py-1.5 align-middle", className)} {...props} />;
}
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">{children}</td>
    </tr>
  );
}
