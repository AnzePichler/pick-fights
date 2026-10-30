import { assertLocalContainer, demoEmail, demoPassword, dockerArguments, runLocal, sandboxAppUrl } from "./local-sandbox-config.mjs";

const command = process.argv[2];

try {
  if (command === "setup") {
    runLocal("docker", [...dockerArguments(), "compose", "--env-file", "/dev/null", "-f", "compose.local.yaml", "up", "-d", "--wait", "--wait-timeout", "120", "db"]);
    assertLocalContainer();
    runLocal("npx", ["prisma", "migrate", "deploy"]);
    runLocal("npx", ["prisma", "generate"]);
    runLocal("npx", ["tsx", "scripts/seed-local-sandbox.ts"]);
    console.log(`\nLocal sandbox ready. Run npm run local:dev, then open ${sandboxAppUrl}/fantasy`);
    console.log(`Demo login: ${demoEmail} / ${demoPassword}`);
  } else if (command === "simulate") {
    assertLocalContainer();
    runLocal("npx", ["tsx", "scripts/simulate-local-event.ts", ...process.argv.slice(3)]);
  } else if (command === "dev") {
    assertLocalContainer();
    console.log(`Local-only app: ${sandboxAppUrl}/fantasy`);
    runLocal("npx", ["next", "dev", "--hostname", "127.0.0.1", "--port", "3105"]);
  } else if (command === "stop") {
    runLocal("docker", [...dockerArguments(), "compose", "--env-file", "/dev/null", "-f", "compose.local.yaml", "stop", "db"]);
    console.log("Local database stopped. Its dedicated volume is preserved.");
  } else {
    throw new Error("Usage: node scripts/local-sandbox.mjs setup|dev|stop|simulate");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
