import "dotenv/config";
import { prisma } from "../lib/prisma";
import { recalculateEventScores, withEventLock } from "../lib/results";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--apply" && !argument.startsWith("--event="))) throw new Error("Use --apply and/or --event=slug.");
  const slug = args.find((argument) => argument.startsWith("--event="))?.slice(8);
  const events = await prisma.event.findMany({ where: slug ? { slug } : {}, select: { id: true } });
  if (slug && !events.length) throw new Error("Event not found.");
  if (!process.argv.includes("--apply")) {
    console.log(`Dry run: ${events.length} events. Use --apply to rebuild event and per-pick scores.`);
    return;
  }
  for (const event of events) {
    await withEventLock(prisma, event.id, async (transaction) => {
      await recalculateEventScores(transaction, event.id);
      await transaction.event.update({ where: { id: event.id }, data: { resultVersion: { increment: 1 }, lastResultAt: new Date() } });
    });
  }
  console.log(`Rebuilt scores for ${events.length} events.`);
}

main().catch(() => { console.error("Score backfill failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
