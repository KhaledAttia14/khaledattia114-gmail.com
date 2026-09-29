import * as React from "react";

export function PageHeader({ title, description, actions, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-card px-5 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "red" | "amber" | "green" | "default" }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-700" : "text-foreground";
  const body = (
    <div className="rounded-md border bg-card px-3 py-2 transition-colors hover:border-primary/40">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`tabular text-xl font-semibold leading-7 ${color}`}>{value}</div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}
