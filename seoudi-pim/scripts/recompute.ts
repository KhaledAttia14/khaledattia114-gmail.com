/** Recalculate completeness, QC outcome/score and image summary for every product. */
import { db } from "../src/lib/server/db";
import { loadCompletenessRules, loadQcRules, recompute } from "../src/lib/server/products";

async function main() {
  const [completeness, qc] = await Promise.all([loadCompletenessRules(), loadQcRules()]);
  const ids = await db.product.findMany({ select: { id: true } });
  let n = 0;
  for (const { id } of ids) {
    await recompute(id, { completeness, qc });
    if (++n % 50 === 0) console.log(`  ${n}/${ids.length}`);
  }
  console.log(`Recomputed ${n} products.`);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
