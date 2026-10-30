import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sandboxRoot = fileURLToPath(new URL("../", import.meta.url));
export const sandboxUrl = "postgresql://pickfights_local@127.0.0.1:55439/pickfights_fantasy_local";
export const sandboxAppUrl = "http://127.0.0.1:3105";
export const demoEmail = "demo@pickfights.local";
export const demoPassword = "local-fantasy-demo";

export function localEnvironment() {
  const directory = path.join(sandboxRoot, ".local-sandbox");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const secretFile = path.join(directory, "auth-secret");
  if (!fs.existsSync(secretFile)) {
    fs.writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
  }
  return {
    ...process.env,
    DATABASE_URL: sandboxUrl,
    DIRECT_URL: sandboxUrl,
    AUTH_SECRET: fs.readFileSync(secretFile, "utf8").trim(),
    AUTH_URL: sandboxAppUrl,
    NEXTAUTH_URL: sandboxAppUrl,
    AUTH_TRUST_HOST: "true",
    INVITE_CODE: "local-sandbox-only",
    PICKFIGHTS_LOCAL_SANDBOX: "1",
    NODE_ENV: "development",
  };
}

export function runLocal(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: sandboxRoot,
    env: localEnvironment(),
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}).`);
  return result;
}

export function dockerArguments() {
  const context = runLocal("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8", stdio: "pipe" });
  const endpoint = context.stdout.trim();
  if (!endpoint.startsWith("unix:///")) {
    throw new Error("The sandbox requires a local Docker Unix socket; remote Docker contexts are refused.");
  }
  return ["--host", endpoint];
}

export function assertLocalContainer() {
  const dockerArgs = dockerArguments();
  const result = runLocal("docker", [...dockerArgs, "compose", "--env-file", "/dev/null", "-f", "compose.local.yaml", "ps", "-q", "db"], { encoding: "utf8", stdio: "pipe" });
  const containerId = result.stdout.trim();
  if (!containerId || containerId.includes("\n")) throw new Error("Expected one running sandbox database container.");
  const inspection = runLocal("docker", [...dockerArgs, "inspect", containerId], { encoding: "utf8", stdio: "pipe" });
  const [container] = JSON.parse(inspection.stdout);
  const ports = container.NetworkSettings.Ports["5432/tcp"];
  if (
    container.Config.Labels["com.docker.compose.project"] !== "pickfights-fantasy-local" ||
    container.Config.Labels["com.docker.compose.service"] !== "db" ||
    container.State.Health?.Status !== "healthy" ||
    ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== "55439"
  ) {
    throw new Error("Sandbox container identity, health, or loopback port does not match. Refusing database operations.");
  }
}
