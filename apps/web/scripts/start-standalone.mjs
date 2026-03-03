import { cpSync } from "fs";
import { spawn } from "child_process";

// Copy static assets into standalone output
cpSync(".next/static", ".next/standalone/apps/web/.next/static", {
  recursive: true,
  force: true,
});
cpSync("public", ".next/standalone/apps/web/public", {
  recursive: true,
  force: true,
});

console.log("✅ Static assets copied");
console.log("🔍 NEXTAUTH_URL =", process.env);
const env = {
  ...process.env,
  HOSTNAME: "localhost",
  PORT: process.env.PORT || "3000",
};

// Start the Next.js standalone server
const nextServer = spawn("node", [".next/standalone/apps/web/server.js"], {
  stdio: "inherit",
  env,
});

// Start the WebSocket server
const wsServer = spawn("node", ["--import", "tsx", "ws-server.ts"], {
  stdio: "inherit",
  env,
});

// Handle process exit
function cleanup() {
  nextServer.kill();
  wsServer.kill();
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

nextServer.on("close", (code) => {
  console.log(`Next.js server exited with code ${code}`);
  wsServer.kill();
  process.exit(code);
});

wsServer.on("close", (code) => {
  console.log(`WebSocket server exited with code ${code}`);
  nextServer.kill();
  process.exit(code);
});