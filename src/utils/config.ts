// src/utils/config.ts
import fs from "fs";
import path from "path";
import os from "os";

const APP_DIR = path.join(os.homedir(), ".git-explain");
const CONFIG_PATH = path.join(APP_DIR, "config.json");
const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".git-explain.json");

export interface Config {
  aiProvider: "gemini" | "openai";
  apiKey: string;
  model: string;
}

export const defaultModels: Record<Config["aiProvider"], string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
};

export const saveConfig = (config: Config) => {
  ensureAppDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalizeConfig(config), null, 2));
};

export const getConfig = (): Config | null => {
  const pathToRead = fs.existsSync(CONFIG_PATH)
    ? CONFIG_PATH
    : LEGACY_CONFIG_PATH;

  if (!fs.existsSync(pathToRead)) return resolveConfig({});

  const config = JSON.parse(fs.readFileSync(pathToRead, "utf-8"));
  return resolveConfig(config as Partial<Config>);
};

export const resolveConfig = (config: Partial<Config>): Config | null => {
  const aiProvider = config.aiProvider || getProviderFromEnv();
  if (aiProvider !== "gemini" && aiProvider !== "openai") return null;

  const apiKey =
    config.apiKey?.trim() ||
    getEnvApiKey(aiProvider) ||
    getEnvApiKey("openai") ||
    getEnvApiKey("gemini");

  if (!apiKey) return null;

  return normalizeConfig({
    aiProvider,
    apiKey,
    model: config.model || defaultModels[aiProvider],
  });
};

export const getAppDir = (): string => {
  return APP_DIR;
};

export const getConfigPath = (): string => {
  return CONFIG_PATH;
};

export const ensureAppDir = (): void => {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
};

const normalizeConfig = (config: Config): Config => ({
  ...config,
  apiKey: config.apiKey.trim(),
  model: config.model.trim() || defaultModels[config.aiProvider],
});

const getProviderFromEnv = (): Config["aiProvider"] | null => {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  return null;
};

const getEnvApiKey = (provider: Config["aiProvider"]): string | null => {
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }

  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    null
  );
};
