"use client";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function MultiFilter({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const active = value.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted", active ? "border-primary/50 bg-accent text-accent-foreground" : "border-input bg-card")}>
        {label}
        {active && <span className="rounded bg-primary px-1 text-[10px] font-semibold text-white">{value.length}</span>}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuCheckboxItem key={o.value} checked={value.includes(o.value)} onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))}>
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (<><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem></>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
