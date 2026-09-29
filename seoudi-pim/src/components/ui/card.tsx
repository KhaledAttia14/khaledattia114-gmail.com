import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border bg-card text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, title, actions, children }: { className?: string; title?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2", className)}>
      <div className="min-w-0">
        {title && <h3 className="truncate text-[13px] font-semibold">{title}</h3>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-3", className)} {...props} />;
}
