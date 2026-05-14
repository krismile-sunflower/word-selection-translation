import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname } from "path";
import { mkdirSync } from "fs";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AppConfig {
  providers: Provider[];
  activeProviderId: string;
  triggerMode: string;
  minChars: number;
  popupLingerMs: number;
  systemPrompt: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  providers: [
    {
      id: "zhipu",
      name: "智谱 AI",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4.5-air",
      apiKey: "",
    },
  ],
  activeProviderId: "zhipu",
  triggerMode: "auto",
  minChars: 2,
  popupLingerMs: 0,
  systemPrompt: null,
};

function getConfigPath(): string {
  const idx = process.argv.indexOf("--config-path");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return "./settings.json";
}

const CONFIG_PATH = getConfigPath();

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return DEFAULT_CONFIG;
    }
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (data.config) {
      return data.config as AppConfig;
    }
    // Migrate old flat format
    if (data.api_key !== undefined) {
      return {
        providers: [
          {
            id: "default",
            name: "默认",
            baseUrl: data.base_url ?? "https://open.bigmodel.cn/api/paas/v4",
            model: data.model ?? "glm-4.5-air",
            apiKey: data.api_key ?? "",
          },
        ],
        activeProviderId: "default",
        triggerMode: data.trigger_mode ?? "auto",
        minChars: data.min_chars ?? 2,
        popupLingerMs: data.popup_linger_ms ?? 0,
        systemPrompt: data.system_prompt ?? null,
      };
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig) {
  ensureDir(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify({ config }, null, 2), "utf-8");
}
