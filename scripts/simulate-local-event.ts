import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type EventStatus, type FightMethod, type FightResultStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertLocalContainer, sandboxRoot, sandboxUrl } from "./local-sandbox-config.mjs";
import { FANTASY_SLOTS, scoreFantasyChoice, type FantasyChoice } from "../lib/fantasy";

type SimulationBackup = {
  eventId: string;
  status: EventStatus;
  lockAt: string;
  results: {
    fightId: string;
    status: FightResultStatus;
    winnerFighterId: string | null;
    method: FightMethod | null;
    round: number | null;
  }[];
};

async function main() {
  if (process.env.PICKFIGHTS_LOCAL_SANDBOX !== "1" || process.env.DATABASE_URL !== sandboxUrl || process.env.DIRECT_URL !== sandboxUrl) {
    throw new Error("This simulation only runs through npm run local:simulate against the local sandbox.");
  }
  assertLocalContainer();
  const action = process.argv[2] ?? "complete";
  if (!["lock", "next", "complete", "reopen", "status"].includes(action)) {
    throw new Error("Use local:simulate -- lock|next|complete|reopen|status");
  }
  const eventId = "local-fantasy-event";
  const backupPath = path.join(sandboxRoot, ".local-sandbox", "fantasy-simulation.json");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: sandboxUrl }) });
  try {
    const [identity] = await prisma.$queryRaw<{ database: string; username: string }[]>`SELECT current_database()::text AS database, current_user::text AS username`;
    if (identity.database !== "pickfights_fantasy_local" || identity.username !== "pickfights_local") {
      throw new Error("Unexpected database identity; refusing simulation.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
      const event = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
        include: {
          fights: { orderBy: { order: "asc" }, include: { result: true } },
          fantasyLineups: { where: { userId: "local-demo-user" }, include: { choices: true } },
        },
      });
      if (action === "status") return;
      if (action === "reopen") {
        if (!fs.existsSync(backupPath)) throw new Error("No simulation backup found. Nothing was changed.");
        const backup: SimulationBackup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
        if (backup.eventId !== eventId || backup.results.some((result) => !event.fights.some((fight) => fight.id === result.fightId))) {
          throw new Error("The backup does not match this demo card. Refusing to restore it.");
        }
        for (const { fightId, ...result } of backup.results) {
          await tx.fightResult.upsert({ where: { fightId }, create: { fightId, ...result }, update: result });
        }
        await tx.event.update({ where: { id: eventId }, data: { status: "OPEN", lockAt: new Date(Math.max(new Date(backup.lockAt).getTime(), Date.now() + 24 * 3600000)) } });
        console.log("Reopened the local demo and restored its pre-simulation results. Your saved lineup is unchanged.");
        return;
      }
      const choices = event.fantasyLineups[0]?.choices;
      if (choices?.length !== 5) throw new Error("Save a complete lineup with the demo account before simulating.");
      if (!fs.existsSync(backupPath)) {
        const backup: SimulationBackup = {
          eventId, status: event.status, lockAt: event.lockAt.toISOString(),
          results: event.fights.map((fight) => ({
            fightId: fight.id, status: fight.result?.status ?? "PENDING", winnerFighterId: fight.result?.winnerFighterId ?? null,
            method: fight.result?.method ?? null, round: fight.result?.round ?? null,
          })),
        };
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: "wx" });
      }
      if (action === "lock") {
        if (event.status !== "OPEN") throw new Error("Reopen the demo before starting a new simulation.");
        await tx.event.update({ where: { id: eventId }, data: { status: "LOCKED", lockAt: new Date(Date.now() - 1000) } });
        console.log("Deadline reached: your latest saved lineup is locked. All unresolved slots remain pending.");
        return;
      }
      await tx.event.update({ where: { id: eventId }, data: { status: "LOCKED", lockAt: new Date(Date.now() - 1000) } });
      const pending = event.fights.filter((fight) => fight.status === "ACTIVE" && (!fight.result || fight.result.status === "PENDING"));
      const resolving = action === "next" ? pending.slice(0, 1) : pending;
      for (const fight of resolving) {
        const selection = FANTASY_SLOTS.map((slot) => choices.find((choice) => choice.slot === slot.id && choice.fightId === fight.id)).find(Boolean);
        const method: FightMethod = selection?.slot === "FINISH_TWO" ? "SUBMISSION"
          : selection?.slot === "FINISH_ONE" || selection?.slot === "DECISION" || !selection ? "DECISION" : "KO_TKO";
        const result = { status: "WINNER" as const, winnerFighterId: selection?.fighterId ?? fight.fighterAId, method, round: method === "DECISION" ? 3 : 2 };
        await tx.fightResult.upsert({ where: { fightId: fight.id }, create: { fightId: fight.id, ...result }, update: result });
      }
      if (resolving.length === pending.length) {
        await tx.event.update({ where: { id: eventId }, data: { status: "COMPLETED" } });
      }
      console.log(`Revealed ${resolving.length} simulated fight result(s). Lineup selections were not changed.`);
    });
    if (action === "reopen") fs.unlinkSync(backupPath);
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        fights: { include: { result: true, fighterA: true, fighterB: true } },
        fantasyLineups: { where: { userId: "local-demo-user" }, include: { choices: true } },
      },
    });
    let total = 0;
    for (const slot of FANTASY_SLOTS) {
      const choice: FantasyChoice | undefined = event.fantasyLineups[0]?.choices.find((item) => item.slot === slot.id);
      if (!choice) continue;
      const fight = event.fights.find((item) => item.id === choice.fightId);
      const fighter = fight?.fighterAId === choice.fighterId ? fight.fighterA : fight?.fighterB;
      const score = scoreFantasyChoice(choice, fight);
      total += score ?? 0;
      console.log(`${slot.id}: ${fighter?.name} | ${fight?.result?.status ?? "PENDING"} ${fight?.result?.method ?? ""} | ${score === null ? "Pending" : `${score} points`}`);
    }
    console.log(`${event.status}: ${total}/300 points. Refresh the Fantasy page to view this stage.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
