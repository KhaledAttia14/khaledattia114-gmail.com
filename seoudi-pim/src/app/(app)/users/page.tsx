import { requirePagePermission } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/pim/page-header";
import { PERMISSIONS, ROLES, ROLE_LABELS } from "@/lib/domain/rbac";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { UsersClient } from "./users-client";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePagePermission("users.manage");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }], include: { _count: { select: { ownedProducts: true } } } });
  return (
    <div>
      <PageHeader title="Users & roles" description="Role-based access control. Permissions are attached to roles only – never to named people." />
      <div className="space-y-4 p-5">
        <UsersClient me={me.id} users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt, products: u._count.ownedProducts }))} />
        <Card>
          <CardHeader title="Permission matrix" />
          <Table>
            <THead><tr><TH>Permission</TH>{ROLES.map((r) => <TH key={r} className="text-center">{ROLE_LABELS[r]}</TH>)}</tr></THead>
            <TBody>
              {Object.entries(PERMISSIONS).map(([perm, roles]) => (
                <TR key={perm}><TD className="font-mono text-[12px]">{perm}</TD>
                  {ROLES.map((r) => <TD key={r} className="text-center">{(roles as readonly string[]).includes(r) ? <span className="text-emerald-600">●</span> : <span className="text-slate-300">·</span>}</TD>)}</TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
