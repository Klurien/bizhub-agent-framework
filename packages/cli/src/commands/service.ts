import chalk from "chalk";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BIZHUB_DIR = join(homedir(), ".bizhub");
const ECOSYSTEM_PATH = join(BIZHUB_DIR, "ecosystem.config.json");
const ECOMMERCE_WEB = join(homedir(), "ecommerce-web");
const BIZHUB = join(homedir(), "bizhub");

function pm2(args: string): string {
  try {
    return execSync(`pm2 ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.HOME}/.npm-global/bin:${process.env.PATH || ""}` },
    });
  } catch (e) {
    throw new Error(`PM2 error: ${(e as Error).message}`);
  }
}

function pm2Detached(args: string[]) {
  const child = spawn("pm2", args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: `${process.env.HOME}/.npm-global/bin:${process.env.PATH || ""}` },
  });
  child.unref();
}

function ensureEcosystem(): boolean {
  if (!existsSync(ECOSYSTEM_PATH)) {
    console.log(chalk.yellow("  ⚠ No PM2 ecosystem found. Run `bizhub setup` first."));
    return false;
  }
  return true;
}

export async function startCommand(services?: string) {
  if (!ensureEcosystem()) return;

  const name = services || "all";
  console.log(chalk.bold(`\n  🚀 Starting BizHub services (${name})...\n`));

  if (name === "all" || name === "marketplace") {
    if (existsSync(ECOMMERCE_WEB)) {
      console.log(`  ${chalk.cyan("→")} Starting marketplace...`);
      pm2Detached(["start", ECOSYSTEM_PATH, "--only", "bizhub-marketplace"]);
      console.log(`  ${chalk.green("✔")} Marketplace starting on port 8080`);
    } else {
      console.log(`  ${chalk.yellow("○")} Marketplace not found at ~/ecommerce-web`);
    }
  }

  if (name === "all" || name === "mcp") {
    console.log(`  ${chalk.cyan("→")} Starting MCP server...`);
    pm2Detached(["start", ECOSYSTEM_PATH, "--only", "bizhub-mcp"]);
    console.log(`  ${chalk.green("✔")} MCP server starting on port 3100`);
  }

  if (name === "all" || name === "turn") {
    const turnPath = join(homedir(), ".local", "bin", "turnserver");
    if (existsSync(turnPath)) {
      console.log(`  ${chalk.cyan("→")} Starting TURN server...`);
      pm2Detached(["start", ECOSYSTEM_PATH, "--only", "bizhub-turn"]);
      console.log(`  ${chalk.green("✔")} TURN server starting`);
    } else {
      console.log(`  ${chalk.yellow("○")} TURN server not found`);
    }
  }

  console.log(chalk.dim(`\n  Run ${chalk.cyan("bizhub status")} to check.\n`));
}

export async function stopCommand(services?: string) {
  if (!ensureEcosystem()) return;

  const name = services || "all";
  console.log(chalk.bold(`\n  🛑 Stopping BizHub services (${name})...\n`));

  try {
    if (name === "all") {
      pm2("stop all");
    } else {
      pm2(`stop bizhub-${name}`);
    }
    console.log(`  ${chalk.green("✔")} Stopped\n`);
  } catch (e) {
    console.log(`  ${chalk.yellow("⚠")} ${(e as Error).message}`);
  }
}

export async function statusCommand() {
  console.log(chalk.bold("\n  📊 BizHub Service Status\n"));

  try {
    const output = pm2("status");
    console.log(output);
  } catch (e) {
    console.log(chalk.dim("  No PM2 processes running\n"));
  }

  const cfgPath = join(BIZHUB_DIR, "config.json");
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    console.log(chalk.bold("  Configuration\n"));
    console.log(`  API URL:  ${cfg.apiUrl}`);
    console.log(`  Auth:     ${cfg.authCookie ? chalk.green("configured") : cfg.apiKey ? chalk.green("API key") : chalk.red("none")}`);
    console.log();
  }
}

export async function restartCommand(services?: string) {
  if (!ensureEcosystem()) return;

  const name = services || "all";
  console.log(chalk.bold(`\n  🔄 Restarting BizHub services (${name})...\n`));

  try {
    if (name === "all") {
      pm2("restart all");
    } else {
      pm2(`restart bizhub-${name}`);
    }
    console.log(`  ${chalk.green("✔")} Restarted\n`);
  } catch (e) {
    console.log(`  ${chalk.yellow("⚠")} ${(e as Error).message}`);
  }
}

export async function logsCommand(services?: string, tail?: boolean) {
  if (!ensureEcosystem()) return;

  const name = services || "all";
  const args = ["logs", "--nostream", "--lines", tail ? "999999" : "50"];
  if (name !== "all") args.push(`bizhub-${name}`);

  try {
    const out = execSync(`pm2 ${args.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.HOME}/.npm-global/bin:${process.env.PATH || ""}` },
    });
    console.log(out);
  } catch (e) {
    console.log(`  ${chalk.yellow("⚠")} ${(e as Error).message}`);
  }
}
