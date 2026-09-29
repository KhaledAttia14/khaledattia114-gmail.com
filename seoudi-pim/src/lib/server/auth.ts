import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { ForbiddenError } from "./errors";
import { can, type Permission, type Role } from "@/lib/domain/rbac";

export const SESSION_COOKIE = "pim_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

let dummyHash: string | undefined;

export async function verifyLogin(email: string, password: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) {
    dummyHash ??= bcrypt.hashSync("not-a-real-password", 10);
    await bcrypt.compare(password, dummyHash); // equalise timing for unknown users
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
}

export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export { ForbiddenError };

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u.role, permission)) throw new ForbiddenError();
  return u;
}

/** For pages: redirect to dashboard instead of throwing. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u.role, permission)) redirect("/dashboard?denied=1");
  return u;
}
