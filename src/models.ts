import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { xdgCache } from "xdg-basedir";

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_PATH = join(
  xdgCache ?? join(homedir(), ".cache"),
  "opencode",
  "models.json",
);
const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_HUB_BASE = "https://hub.coreinfra.ai";
const HUB_URL = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/hub/api/prices`;
const OPENAI_BASE = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/codex/api/v1`;
const ANTHROPIC_BASE = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/claude/api/v1`;
const ANTHROPIC_BETA_HEADER =
  "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";

const DEFAULT_LIMIT = { context: 200000, output: 64000 };
const DEFAULT_CAPS = {
  attachment: true,
  reasoning: true,
  temperature: true,
  tool_call: true,
};
const DEFAULT_COST = {
  input: 0,
  output: 0,
  cache_read: 0,
  cache_write: 0,
};

type ModelDevEntry = {
  id?: string;
  name?: string;
  limit?: { context?: number; output?: number };
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
};

type ModelsDevData = {
  [provider: string]: {
    models?: {
      [modelId: string]: ModelDevEntry;
    };
  };
};

type HubResponse = {
  providers: {
    [provider: string]: {
      models?: {
        [model: string]: { display_name: string };
      };
    };
  };
};

export type ConfigModel = {
  id: string;
  name: string;
  provider: {
    api: string;
    npm: string;
  };
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  modalities: {
    input: string[];
    output: string[];
  };
  cost: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  limit: {
    context: number;
    output: number;
  };
  interleaved: boolean | { field: string };
  headers: Record<string, string>;
};

function buildLookupMap(modelsDevData: ModelsDevData) {
  const byFullId = new Map<string, ModelDevEntry>();
  const allowedProviders = new Set(["openai", "anthropic", "deepseek"]);

  for (const [provider, providerData] of Object.entries(modelsDevData)) {
    if (!allowedProviders.has(provider) || !providerData?.models) continue;
    for (const [modelId, entry] of Object.entries(providerData.models)) {
      byFullId.set(`${provider}/${modelId}`, entry);
    }
  }

  return byFullId;
}

function resolveEntry(
  provider: string,
  modelId: string,
  byFullId: Map<string, ModelDevEntry>,
): ModelDevEntry | null {
  const entry = byFullId.get(`${provider}/${modelId}`);
  return entry ?? null;
}

function extractCost(entry?: ModelDevEntry | null) {
  return {
    input: entry?.cost?.input ?? DEFAULT_COST.input,
    output: entry?.cost?.output ?? DEFAULT_COST.output,
    cache_read: entry?.cost?.cache_read ?? DEFAULT_COST.cache_read,
    cache_write: entry?.cost?.cache_write ?? DEFAULT_COST.cache_write,
  };
}

export async function fetchModelsDevData(): Promise<ModelsDevData> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as ModelsDevData;
  } catch {
    const res = await fetch(MODELS_DEV_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch models.dev: ${res.status} ${res.statusText}`,
      );
    }
    return res.json() as Promise<ModelsDevData>;
  }
}

export async function fetchHubModels(): Promise<HubResponse> {
  const res = await fetch(HUB_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch CoreInfra prices: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<HubResponse>;
}

function usesAnthropicApi(provider: string): boolean {
  return provider === "anthropic" || provider === "deepseek";
}

export function buildConfigModels(
  modelsDevData: ModelsDevData,
  hubData: HubResponse,
): { models: Record<string, ConfigModel>; warnings: string[] } {
  const byFullId = buildLookupMap(modelsDevData);
  const models: Record<string, ConfigModel> = {};
  const warnings: string[] = [];

  for (const [provider, providerData] of Object.entries(hubData.providers)) {
    if (!providerData?.models) continue;

    const anthropic = usesAnthropicApi(provider);

    for (const [modelId, hubModel] of Object.entries(providerData.models)) {
      const entry = resolveEntry(provider, modelId, byFullId);

      if (!entry) {
        warnings.push(
          `${provider}/${modelId} not found in models.dev — using defaults`,
        );
      }

      models[modelId] = {
        id: modelId,
        name: entry?.name ?? hubModel.display_name,
        provider: {
          api: anthropic ? ANTHROPIC_BASE : OPENAI_BASE,
          npm: anthropic ? "@ai-sdk/anthropic" : "@ai-sdk/openai",
        },
        attachment: entry?.attachment ?? DEFAULT_CAPS.attachment,
        reasoning: entry?.reasoning ?? DEFAULT_CAPS.reasoning,
        temperature: entry?.temperature ?? DEFAULT_CAPS.temperature,
        tool_call: entry?.tool_call ?? DEFAULT_CAPS.tool_call,
        modalities: {
          input: entry?.modalities?.input ?? [
            "text",
            "image",
            "audio",
            "video",
            "pdf",
          ],
          output: entry?.modalities?.output ?? ["text"],
        },
        cost: extractCost(entry),
        limit: {
          context: entry?.limit?.context ?? DEFAULT_LIMIT.context,
          output: entry?.limit?.output ?? DEFAULT_LIMIT.output,
        },
        interleaved: anthropic ? { field: "reasoning_content" } : true,
        headers: anthropic ? { "anthropic-beta": ANTHROPIC_BETA_HEADER } : {},
      };
    }
  }

  return { models, warnings };
}
