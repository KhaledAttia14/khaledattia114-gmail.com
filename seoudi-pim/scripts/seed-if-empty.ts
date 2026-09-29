/**
 * Container start helper: seeds demo data ONLY when the database has no users yet
 * (first deploy). Never touches an existing database.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();
  const users = await db.user.count();
  await db.$disconnect();
  if (users > 0) {
    console.log(`Database already has ${users} user(s) – skipping demo seed.`);
    return;
  }
  console.log("Empty database – loading demo data…");
  execSync("npx tsx prisma/seed.ts && npx tsx --conditions=react-server scripts/recompute.ts", { stdio: "inherit" });
}

main().catch((e) => {
  console.error("Demo seed failed (app will still start):", e);
});
