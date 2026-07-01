import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (!["start", "stop"].includes(action)) {
  console.error("Usage: node scripts/test-db-compose.mjs <start|stop>");
  process.exit(1);
}

const docker = spawnSync("docker", ["--version"], {
  shell: process.platform === "win32",
  stdio: "ignore",
});

if (docker.status !== 0) {
  console.error(
    "Docker is not available. Provide TEST_DATABASE_URL or run this command on a machine with Docker.",
  );
  process.exit(1);
}

const composeArgs =
  action === "start"
    ? ["compose", "-f", "compose.test.yaml", "up", "-d", "postgres-test"]
    : ["compose", "-f", "compose.test.yaml", "down", "--volumes"];

const result = spawnSync("docker", composeArgs, {
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
