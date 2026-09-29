"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, CalendarCheck, ClipboardCheck, FileDown, FileUp, FolderTree, Gauge, Image as ImageIcon, ListChecks, Package, Settings, SlidersHorizontal, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/products", label: "Products", icon: Package },
  { href: "/tasks", label: "My Tasks", icon: ListChecks },
  { href: "/qc", label: "QC Queue", icon: ClipboardCheck },
  { href: "/images", label: "Images", icon: ImageIcon },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/attributes", label: "Attributes", icon: SlidersHorizontal },
  { href: "/imports", label: "Imports", icon: FileUp },
  { href: "/exports", label: "Exports", icon: FileDown },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card max-md:hidden">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <div className="grid size-7 place-items-center rounded bg-primary text-[11px] font-bold text-white">S</div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Seoudi PIM</div>
          <div className="text-[10px] text-muted-foreground">Content Operations</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={cn("flex items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-slate-600 hover:bg-muted hover:text-foreground",
                active && "bg-accent font-medium text-accent-foreground")}>
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {counts[href] ? <span className="tabular rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{counts[href]}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-[10px] text-muted-foreground">RMS → Content → Images → QC → Magento → Live</div>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-1 md:hidden">
      {NAV.map(({ href, label }) => (
        <Link key={href} href={href} className="whitespace-nowrap rounded px-2 py-1 text-xs hover:bg-muted">{label}</Link>
      ))}
    </nav>
  );
}
