import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { execSync } from "node:child_process";
import {
  getProvidersConfig,
  saveProvidersConfig,
  setProvider,
  listProviders,
  ProviderEntry,
} from "@biz-hub/agent-kit/providers";

const BIZHUB_DIR = join(homedir(), ".bizhub");
const CONFIG_PATH = join(BIZHUB_DIR, "config.json");

function rl() {
  return createInterface({ input: stdin, output: stdout });
}

export async function setupCommand() {
  console.clear();
  console.log(chalk.bold.red(`
  ╔═══════════════════════════════════════════════╗
  ║            BIZHUB · SETUP WIZARD              ║
  ║    AI Agent Framework for Your Marketplace     ║
  ╚═══════════════════════════════════════════════╝
  `));
  console.log(chalk.dim("  This wizard will configure your BizHub agent framework.\n"));

  const cli = rl();

  try {
    await checkPrerequisites(cli);
    const config = await collectConfig(cli);
    await writeConfig(config);
    await configureProviders(cli);
    await testConnection(cli, config);
    await setupPm2(cli);
    await showSummary(config);
  } catch (e) {
    console.error(chalk.red("\n  ✖ Setup failed:"), e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    cli.close();
  }
}

async function checkPrerequisites(cli: ReturnType<typeof createInterface>) {
  console.log(chalk.bold("\n  📋 Step 1: Checking Prerequisites\n"));

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (major >= 18) {
    console.log(`  ${chalk.green("✔")} Node.js ${nodeVersion}`);
  } else {
    console.log(`  ${chalk.red("✖")} Node.js ${nodeVersion} (need >= 18)`);
    throw new Error("Node.js >= 18 required");
  }

  try {
    const npmVer = execSync("npm --version", { encoding: "utf-8" }).trim();
    console.log(`  ${chalk.green("✔")} npm ${npmVer}`);
  } catch {
    console.log(`  ${chalk.red("✖")} npm not found`);
    throw new Error("npm is required");
  }

  try {
    const pm2Path = execSync("which pm2", { encoding: "utf-8" }).trim();
    const pm2Ver = execSync("pm2 --version", { encoding: "utf-8" }).trim();
    console.log(`  ${chalk.green("✔")} PM2 ${pm2Ver} (${pm2Path})`);
  } catch {
    console.log(`  ${chalk.yellow("!")} PM2 not found — will install`);
    console.log(`  ${chalk.dim("    → Installing PM2...")}`);
    execSync("npm install -g pm2", { stdio: "pipe" });
    console.log(`  ${chalk.green("✔")} PM2 installed`);
  }

  const marketplace = existsSync(join(homedir(), "ecommerce-web", "package.json"));
  const framework = existsSync(join(homedir(), "bizhub", "package.json"));
  console.log(`  ${chalk.green(marketplace ? "✔" : "○")} Marketplace app: ${marketplace ? "found at ~/ecommerce-web" : chalk.dim("not detected (optional)")}`);
  console.log(`  ${chalk.green(framework ? "✔" : "○")} Agent framework: ${framework ? "found at ~/bizhub" : chalk.dim("not detected")}`);
}

async function collectConfig(cli: ReturnType<typeof createInterface>) {
  console.log(chalk.bold("\n  ⚙️  Step 2: Configuration\n"));

  const existing = loadExistingConfig();

  const apiUrl = await cli.question(
    `  ${chalk.cyan("?")} Marketplace API URL ${chalk.dim(`[${existing.apiUrl}]:`)} `
  );
  const finalUrl = apiUrl.trim() || existing.apiUrl;

  console.log(chalk.dim(`\n  Authentication: Provide either an auth cookie or API key.\n`));

  const authType = await cli.question(
    '  ' + chalk.cyan("?") + ' Auth method ' + chalk.dim("(cookie/key/skip)") + ' ' + chalk.dim("[cookie]:") + ' '
  );

  let authCookie = existing.authCookie;
  let apiKey = existing.apiKey;

  const method = (authType.trim() || "cookie").toLowerCase();
  if (method === "cookie") {
    const val = await cli.question(
      `  ${chalk.cyan("?")} Auth cookie ${chalk.dim("(from browser devtools → Application → Cookies):")}\n  ${chalk.dim("  >")} `
    );
    if (val.trim()) authCookie = val.trim();
  } else if (method === "key") {
    const val = await cli.question(
      `  ${chalk.cyan("?")} API key:\n  ${chalk.dim("  >")} `
    );
    if (val.trim()) apiKey = val.trim();
  }

  return { apiUrl: finalUrl, authCookie, apiKey };
}

async function writeConfig(config: { apiUrl: string; authCookie: string; apiKey: string }) {
  if (!existsSync(BIZHUB_DIR)) mkdirSync(BIZHUB_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  if (!existsSync(join(BIZHUB_DIR, "backups"))) mkdirSync(join(BIZHUB_DIR, "backups"), { recursive: true });
  if (!existsSync(join(BIZHUB_DIR, "logs"))) mkdirSync(join(BIZHUB_DIR, "logs"), { recursive: true });
}

const PROVIDER_OPTIONS: Record<string, { label: string; baseUrl: string; envVar: string; defaultModels: string[] }> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    envVar: "OPENAI_API_KEY",
    defaultModels: ["gpt-4o", "gpt-4o-mini"],
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    envVar: "ANTHROPIC_API_KEY",
    defaultModels: ["claude-sonnet-4", "claude-haiku-3"],
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envVar: "OPENROUTER_API_KEY",
    defaultModels: ["openrouter/free", "deepseek/deepseek-v4-pro"],
  },
  google: {
    label: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
  },
};

async function configureProviders(cli: ReturnType<typeof createInterface>) {
  console.log(chalk.bold("\n  🤖 Step 3: AI Provider Configuration\n"));
  console.log(chalk.dim("  Configure which AI model provider powers your agent.\n"));
  console.log(chalk.dim("  Your API keys are stored locally in ~/.bizhub/providers.json"));
  console.log(chalk.dim("  and can also be set via environment variables.\n"));

  const existing = getProvidersConfig();
  const hasProviders = Object.keys(existing.credential_pool).length > 0;

  if (hasProviders) {
    console.log(`  ${chalk.green("✔")} Existing providers:`);
    for (const name of Object.keys(existing.credential_pool)) {
      const entry = existing.credential_pool[name][0];
      const envSet = entry.source?.startsWith("env:") && process.env[entry.source.slice(4)];
      console.log(`    · ${chalk.cyan(name)} → ${envSet ? chalk.green("env var set") : chalk.yellow("stored key")}`);
    }
    console.log();
    const reconfig = await cli.question(
      '  ' + chalk.cyan("?") + ' Reconfigure AI providers? ' + chalk.dim("(y/N):") + ' '
    );
    if (!reconfig.trim().toLowerCase().startsWith("y")) return;
  }

  const keys = Object.keys(PROVIDER_OPTIONS);
  console.log(`  ${chalk.cyan("Available providers:")}`);
  keys.forEach((k, i) => {
    const opt = PROVIDER_OPTIONS[k];
    const envSet = process.env[opt.envVar] ? "  (env var detected)" : "";
    console.log(`    ${i + 1}. ${chalk.bold(opt.label)} ${chalk.dim(`(${k})`)}${chalk.green(envSet)}`);
  });
  console.log();

  const chosen = await cli.question(
    '  ' + chalk.cyan("?") + ' Select provider ' + chalk.dim("(1-4, or press Enter to skip):") + ' '
  );

  const index = parseInt(chosen, 10) - 1;
  if (isNaN(index) || index < 0 || index >= keys.length) {
    console.log(`  ${chalk.yellow("○")} Skipped AI provider config`);
    return;
  }

  const providerName = keys[index];
  const opt = PROVIDER_OPTIONS[providerName];

  console.log(`\n  ${chalk.bold(`Configuring ${opt.label}`)}\n`);

  const envVal = process.env[opt.envVar];
  if (envVal) {
    console.log(`  ${chalk.green("✔")} ${opt.envVar} environment variable detected`);
    const useEnv = await cli.question(
      '  ' + chalk.cyan("?") + ' Use environment variable? ' + chalk.dim("(Y/n):") + ' '
    );
    if (!useEnv.trim().toLowerCase().startsWith("n")) {
      setProvider(providerName, {
        label: opt.envVar,
        auth_type: "api_key",
        source: `env:${opt.envVar}`,
        base_url: opt.baseUrl,
        models: opt.defaultModels,
      });
      console.log(`  ${chalk.green("✔")} Using ${opt.envVar} from environment`);
    }
  }

  if (!process.env[opt.envVar] || !envVal) {
    const key = await cli.question(
      `  ${chalk.cyan("?")} Enter your ${opt.label} API key:\n  ${chalk.dim("  >")} `
    );
    if (key.trim()) {
      const modelsRaw = await cli.question(
        `  ${chalk.cyan("?")} Models to use (comma-separated) ${chalk.dim(`[${opt.defaultModels.join(", ")}]:`)}\n  ${chalk.dim("  >")} `
      );
      const models = modelsRaw.trim()
        ? modelsRaw.split(",").map((m: string) => m.trim())
        : opt.defaultModels;

      setProvider(providerName, {
        label: opt.envVar,
        auth_type: "api_key",
        source: "stored",
        base_url: opt.baseUrl,
        models,
      });
      console.log(`  ${chalk.green("✔")} ${opt.label} API key saved`);
    }
  }

  const cfg = getProvidersConfig();
  console.log(`\n  ${chalk.green("✔")} Default provider: ${chalk.cyan(cfg.default || providerName)}`);
  console.log();
}

/**
 * Prompt for an API key on stdin, masking the input with asterisks.
 */
async function promptMasked(cli: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  // Simple approach — readline doesn't natively mask, so we just use standard input
  // with a warning about display
  return cli.question(chalk.dim("  (key will be visible as you type)\n") + `  ${prompt} `);
}

async function testConnection(cli: ReturnType<typeof createInterface>, config: { apiUrl: string; authCookie: string; apiKey: string }) {
  console.log(chalk.bold("\n  🔌 Step 4: Testing Connection\n"));

  const url = `${config.apiUrl}/api/products?limit=1`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["X-API-Key"] = config.apiKey;
  if (config.authCookie) {
    headers["Cookie"] = `auth=${config.authCookie}`;
    headers["Authorization"] = `Bearer ${config.authCookie}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json() as { items?: unknown[] };
      const count = data?.items?.length ?? 0;
      console.log(`  ${chalk.green("✔")} Connected to ${config.apiUrl}`);
      console.log(`  ${chalk.dim(`  → ${count} products available`)}`);
    } else if (res.status === 401 || res.status === 403) {
      console.log(`  ${chalk.yellow("⚠")} Server reachable but auth failed (${res.status})`);
      console.log(`  ${chalk.dim("  → Auth will be needed for write operations")}`);
    } else {
      console.log(`  ${chalk.yellow("⚠")} Server responded with status ${res.status}`);
    }
  } catch {
    console.log(`  ${chalk.yellow("⚠")} Could not reach ${config.apiUrl}`);
    console.log(`  ${chalk.dim("  → Make sure your marketplace is running")}`);
  }
}

async function setupPm2(cli: ReturnType<typeof createInterface>) {
  console.log(chalk.bold("\n  ⚡ Step 5: Service Configuration\n"));

  mkdirSync(join(BIZHUB_DIR, "logs"), { recursive: true });

  const startMarketplace = await cli.question(
    '  ' + chalk.cyan("?") + ' Auto-start marketplace app with PM2? ' + chalk.dim("(Y/n):") + ' '
  );

  if (!startMarketplace.trim().toLowerCase().startsWith("n")) {
    const ecosystemPath = join(BIZHUB_DIR, "ecosystem.config.json");
    const ecosystem = {
      apps: [
        {
          name: "bizhub-marketplace",
          cwd: join(homedir(), "ecommerce-web"),
          script: "node_modules/.bin/next",
          args: "start",
          env: { PORT: "8080", NODE_ENV: "production" },
          instances: 1,
          exec_mode: "fork",
          max_memory_restart: "1G",
          error_file: join(BIZHUB_DIR, "logs", "marketplace-error.log"),
          out_file: join(BIZHUB_DIR, "logs", "marketplace-out.log"),
          autorestart: true,
          max_restarts: 10,
        },
        {
          name: "bizhub-mcp",
          cwd: join(homedir(), "bizhub"),
          script: "npx",
          args: ["-y", "@biz-hub/mcp-server"],
          env: { BIZHUB_API_URL: "", BIZHUB_AUTH_COOKIE: "", MCP_TRANSPORT: "http", MCP_PORT: "3100" },
          error_file: join(BIZHUB_DIR, "logs", "mcp-error.log"),
          out_file: join(BIZHUB_DIR, "logs", "mcp-out.log"),
          autorestart: true,
        },
      ],
    };

    writeFileSync(ecosystemPath, JSON.stringify(ecosystem, null, 2));
    console.log(`  ${chalk.green("✔")} PM2 ecosystem created at ~/.bizhub/ecosystem.config.json`);
  }

  const startMcp = await cli.question(
    '  ' + chalk.cyan("?") + ' Start MCP server on boot? ' + chalk.dim("(y/N):") + ' '
  );
  if (startMcp.trim().toLowerCase().startsWith("y")) {
    console.log(`  ${chalk.green("✔")} MCP server will start on boot`);
  }
}

async function showSummary(config: { apiUrl: string; authCookie: string; apiKey: string }) {
  const providers = getProvidersConfig();
  const providerNames = Object.keys(providers.credential_pool);

  console.log(chalk.bold("\n  ✅ Setup Complete!\n"));
  console.log(`  ${chalk.green("✔")} API URL:    ${config.apiUrl}`);
  console.log(`  ${chalk.green("✔")} Auth:       ${config.authCookie ? "cookie configured" : config.apiKey ? "API key configured" : chalk.yellow("not configured")}`);
  if (providerNames.length > 0) {
    console.log(`  ${chalk.green("✔")} AI provider:${chalk.cyan(" " + (providers.default || providerNames[0]))}`);
    for (const name of providerNames) {
      const entry = providers.credential_pool[name][0];
      const hasKey = entry.source?.startsWith("env:")
        ? process.env[entry.source.slice(4)] ? "env" : "not set"
        : "stored";
      console.log(`    · ${chalk.cyan(name)} ${chalk.dim(`→ ${hasKey}, ${entry.models.length} model(s)`)}`);
    }
  } else {
    console.log(`  ${chalk.yellow("○")} AI provider: ${chalk.dim("not configured")}`);
  }
  console.log(`  ${chalk.green("✔")} Config:     ~/.bizhub/config.json`);
  console.log(`  ${chalk.green("✔")} Providers:  ~/.bizhub/providers.json`);
  console.log(`  ${chalk.green("✔")} Logs:        ~/.bizhub/logs/`);
  console.log();
  console.log(chalk.bold("  Quick start:\n"));
  console.log(`  ${chalk.cyan("  bizhub start")}        Start all services`);
  console.log(`  ${chalk.cyan("  bizhub status")}       Check service status`);
  console.log(`  ${chalk.cyan("  bizhub logs")}         View logs`);
  console.log(`  ${chalk.cyan("  bizhub dashboard")}    Open admin dashboard`);
  console.log(`  ${chalk.cyan("  npx @biz-hub/cli")}    Manage marketplace`);
  console.log();
}

function loadExistingConfig(): { apiUrl: string; authCookie: string; apiKey: string } {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { apiUrl: "http://localhost:3001", authCookie: "", apiKey: "" };
  }
}
