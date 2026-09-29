"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Feedback } from "@/components/pim/feedback";
import { useAction } from "@/components/pim/use-action";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain/rbac";
import { fmtDate } from "@/lib/utils";

interface U { id: string; email: string; name: string; role: string; active: boolean; lastLoginAt: Date | null; products: number }

export function UsersClient({ users, me }: { users: U[]; me: string }) {
  const [f, setF] = useState({ email: "", name: "", role: "CONTENT_CREATOR" as Role, password: "" });
  const { pending, result, run } = useAction();
  return (
    <Card>
      <CardHeader title={`Users (${users.length})`} />
      <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
        <Input className="h-7 w-56 text-xs" placeholder="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input className="h-7 w-44 text-xs" placeholder="Display name / team label" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <NativeSelect className="h-7 w-48 text-xs" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</NativeSelect>
        <Input className="h-7 w-44 text-xs" type="password" placeholder="Initial password (10+)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button size="xs" disabled={pending} onClick={() => run(() => createUserAction(f), () => setF({ email: "", name: "", role: "CONTENT_CREATOR", password: "" }))}><UserPlus />Add user</Button>
        <Feedback result={result} />
      </div>
      <Table>
        <THead><tr><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Status</TH><TH className="text-right">Owned products</TH><TH>Last login</TH><TH>Reset password</TH></tr></THead>
        <TBody>{users.map((u) => <Row key={u.id} u={u} me={me} />)}</TBody>
      </Table>
    </Card>
  );
}

function Row({ u, me }: { u: U; me: string }) {
  const [pw, setPw] = useState("");
  const { pending, result, run } = useAction();
  return (
    <TR className={u.active ? "" : "opacity-60"}>
      <TD className="font-medium">{u.name}{u.id === me && <Badge className="ml-1">you</Badge>}</TD>
      <TD>{u.email}</TD>
      <TD>
        <NativeSelect className="h-7 w-48 text-xs" value={u.role} disabled={pending} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value as Role }))}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
      </TD>
      <TD><Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => updateUserAction(u.id, { active: !u.active }))}>{u.active ? "Deactivate" : "Activate"}</Button></TD>
      <TD className="tabular text-right">{u.products}</TD>
      <TD className="whitespace-nowrap text-muted-foreground">{u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : "never"}</TD>
      <TD>
        <div className="flex gap-1">
          <Input className="h-7 w-36 text-xs" type="password" placeholder="new password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button size="xs" variant="ghost" disabled={pending || pw.length < 10} onClick={() => run(() => updateUserAction(u.id, { password: pw }), () => setPw(""))}>Set</Button>
        </div>
        {result && !result.ok && <Feedback result={result} />}
      </TD>
    </TR>
  );
}
