import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface BizHubConfig {
  apiUrl: string;
  authCookie: string;
  apiKey?: string;
}

const configDir = join(homedir(), ".bizhub");
const configPath = join(configDir, "config.json");

function ensureConfig(): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      JSON.stringify(
        { apiUrl: "http://localhost:3001", authCookie: "", apiKey: "" },
        null,
        2
      )
    );
  }
}

export function getConfig(): BizHubConfig {
  ensureConfig();
  try {
    const raw = readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw) as Partial<BizHubConfig>;
    return {
      apiUrl: process.env.BIZHUB_API_URL || cfg.apiUrl || "http://localhost:3001",
      authCookie: process.env.BIZHUB_AUTH_COOKIE || cfg.authCookie || "",
      apiKey: process.env.BIZHUB_API_KEY || cfg.apiKey || "",
    };
  } catch {
    return {
      apiUrl: process.env.BIZHUB_API_URL || "http://localhost:3001",
      authCookie: process.env.BIZHUB_AUTH_COOKIE || "",
      apiKey: process.env.BIZHUB_API_KEY || "",
    };
  }
}
