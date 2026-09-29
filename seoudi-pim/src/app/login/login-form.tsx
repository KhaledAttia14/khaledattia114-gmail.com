"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue="admin@seoudi.local" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="text-xs text-red-600" role="alert">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
