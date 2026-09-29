import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { logoutAction } from "@/app/actions/auth";
import { MobileNav, Sidebar } from "@/components/pim/sidebar";
import { ROLE_LABELS } from "@/lib/domain/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [myTasks, qc, mentions] = await Promise.all([
    db.product.count({ where: { ownerId: user.id, status: { notIn: ["COMPLETED", "LIVE"] } } }),
    db.product.count({ where: { status: { in: ["READY_FOR_QC", "QC_IN_PROGRESS"] } } }),
    db.mention.count({ where: { userId: user.id, seen: false } }),
  ]);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar counts={{ "/tasks": myTasks, "/qc": qc }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
          <form action="/search" className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input name="q" placeholder="Search SKU, barcode, English / Arabic title, brand…"
              className="h-8 w-full rounded-md border border-input bg-slate-50 pl-8 pr-2 text-[13px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/tasks?tab=mentions" className="text-xs text-muted-foreground hover:text-foreground">
              Mentions {mentions > 0 && <span className="ml-0.5 rounded bg-red-500 px-1.5 text-[10px] font-semibold text-white">{mentions}</span>}
            </Link>
            <div className="text-right leading-tight">
              <div className="text-[12.5px] font-medium">{user.name}</div>
              <div className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Sign out" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>
        <MobileNav />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
