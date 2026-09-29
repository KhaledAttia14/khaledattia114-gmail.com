"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, verifyLogin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

// Simple in-process brute-force throttle (per email + IP). Use a shared store (e.g. Redis) when running several instances.
const failures = new Map<string, { n: number; until: number }>();
const MAX_FAILURES = 8;
const LOCK_MS = 15 * 60_000;

const schema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") || undefined });
  if (!parsed.success) return { error: "Enter a valid email and password" };
  const h = await headers();
  const key = `${parsed.data.email.toLowerCase()}|${h.get("x-forwarded-for")?.split(",")[0] ?? "local"}`;
  const f = failures.get(key);
  if (f && f.n >= MAX_FAILURES && f.until > Date.now()) return { error: "Too many failed attempts – try again in 15 minutes" };
  const user = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!user) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: 0 };
    failures.set(key, { n: cur.n + 1, until: Date.now() + LOCK_MS });
    return { error: "Invalid email or password" };
  }
  failures.delete(key);
  await createSession(user.id, h.get("user-agent"));
  await audit(db, { entityType: "User", entityId: user.id, actorId: user.id, action: "LOGIN", source: "UI" });
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/dashboard";
  redirect(next);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
