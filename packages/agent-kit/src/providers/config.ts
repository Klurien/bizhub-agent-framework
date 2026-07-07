import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BIZHUB_DIR = join(homedir(), ".bizhub");
const PROVIDERS_PATH = join(BIZHUB_DIR, "providers.json");

export interface ProviderEntry {
  label: string;
  auth_type: "api_key";
  source: string;
  base_url: string;
  models: string[];
  last_status?: string | null;
}

export interface ProvidersConfig {
  version: number;
  default: string;
  credential_pool: Record<string, ProviderEntry[]>;
  updated_at?: string;
}

const DEFAULT_PROVIDERS: ProvidersConfig = {
  version: 1,
  default: "openai",
  credential_pool: {},
};

function ensureFile(): void {
  if (!existsSync(BIZHUB_DIR)) mkdirSync(BIZHUB_DIR, { recursive: true });
  if (!existsSync(PROVIDERS_PATH)) {
    writeFileSync(PROVIDERS_PATH, JSON.stringify(DEFAULT_PROVIDERS, null, 2));
  }
}

export function getProvidersConfig(): ProvidersConfig {
  ensureFile();
  try {
    return JSON.parse(readFileSync(PROVIDERS_PATH, "utf-8"));
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export function saveProvidersConfig(cfg: ProvidersConfig): void {
  ensureFile();
  cfg.updated_at = new Date().toISOString();
  writeFileSync(PROVIDERS_PATH, JSON.stringify(cfg, null, 2));
}

export function getProvider(name: string): ProviderEntry | undefined {
  const cfg = getProvidersConfig();
  const entries = cfg.credential_pool[name];
  if (!entries || entries.length === 0) return undefined;
  return entries[0];
}

export function resolveApiKey(entry: ProviderEntry): string | null {
  if (entry.source?.startsWith("env:")) {
    const envVar = entry.source.slice(4);
    const envVal = process.env[envVar];
    if (envVal) return envVal;
  }
  return null;
}

export function getDefaultProvider(): ProviderEntry | undefined {
  const cfg = getProvidersConfig();
  if (cfg.default && cfg.credential_pool[cfg.default]) {
    return cfg.credential_pool[cfg.default][0];
  }
  const keys = Object.keys(cfg.credential_pool);
  if (keys.length > 0) return cfg.credential_pool[keys[0]][0];
  return undefined;
}

export function setProvider(name: string, entry: ProviderEntry): void {
  const cfg = getProvidersConfig();
  cfg.credential_pool[name] = [entry];
  if (!cfg.default) cfg.default = name;
  saveProvidersConfig(cfg);
}

export function removeProvider(name: string): void {
  const cfg = getProvidersConfig();
  delete cfg.credential_pool[name];
  if (cfg.default === name) {
    const keys = Object.keys(cfg.credential_pool);
    cfg.default = keys.length > 0 ? keys[0] : "";
  }
  saveProvidersConfig(cfg);
}

export function listProviders(): string[] {
  return Object.keys(getProvidersConfig().credential_pool);
}
