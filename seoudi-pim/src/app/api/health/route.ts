import { db } from "@/lib/server/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
