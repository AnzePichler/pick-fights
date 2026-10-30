import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const slug = args.find((argument) => !argument.startsWith("--"));
if (args.some((argument) => argument.startsWith("--") && argument !== "--all") || (!slug && !args.includes("--all")) || (slug && args.includes("--all"))) {
  console.error("Usage: node scripts/recalculateEventScores.mjs <event-slug> | --all");
  process.exit(1);
}
const outcome = spawnSync(process.execPath, [
  "--import", "tsx", fileURLToPath(new URL("./backfill-scores.ts", import.meta.url)),
  "--apply", ...(slug ? [`--event=${slug}`] : []),
], { stdio: "inherit" });
process.exitCode = outcome.status ?? 1;
