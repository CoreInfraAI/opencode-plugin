import type { Model } from "@opencode-ai/sdk/v2";
import modelsData from "../models.json" with { type: "json" };

type JsonModelCost = {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
};

type PricesResponse = {
  providers: {
    [provider: string]: {
      models: {
        [model: string]: {
          display_name: string;
        };
      };
    };
  };
};

const HUB_URL = "https://hub.coreinfra.ai/hub/api/prices";
const OPENAI_BASE = "https://hub.coreinfra.ai/codex/api/v1";
const ANTHROPIC_BASE = "https://hub.coreinfra.ai/claude/api/v1";
const ANTHROPIC_BETA_HEADER =
  "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";

const DEFAULT_LIMIT = { context: 200000, output: 64000 };
const DEFAULT_CAPS = {
  temperature: true,
  reasoning: true,
  attachment: true,
  tool_call: true,
};
const DEFAULT_COST: Required<JsonModelCost> = {
  input: 0,
  output: 0,
  cache_read: 0,
  cache_write: 0,
};

type JsonModelEntry = {
  limit?: { context?: number; output?: number };
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  cost?: JsonModelCost;
};

function isAnthropic(provider: string): boolean {
  return provider === "anthropic";
}

function buildModel(
  modelId: string,
  provider: string,
  displayName: string,
): Model {
  const anthropic = isAnthropic(provider);
  const meta = (
    modelsData.models as Record<string, JsonModelEntry | undefined>
  )[modelId];
  const cost = {
    input: meta?.cost?.input ?? DEFAULT_COST.input,
    output: meta?.cost?.output ?? DEFAULT_COST.output,
    cache_read: meta?.cost?.cache_read ?? DEFAULT_COST.cache_read,
    cache_write: meta?.cost?.cache_write ?? DEFAULT_COST.cache_write,
  };

  return {
    id: modelId,
    providerID: "coreinfra",
    api: {
      id: modelId,
      url: anthropic ? ANTHROPIC_BASE : OPENAI_BASE,
      npm: anthropic ? "@ai-sdk/anthropic" : "@ai-sdk/openai",
    },
    name: displayName,
    capabilities: {
      temperature: meta?.temperature ?? DEFAULT_CAPS.temperature,
      reasoning: meta?.reasoning ?? DEFAULT_CAPS.reasoning,
      attachment: meta?.attachment ?? DEFAULT_CAPS.attachment,
      toolcall: meta?.tool_call ?? DEFAULT_CAPS.tool_call,
      input: { text: true, audio: true, image: true, video: true, pdf: true },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: anthropic ? { field: "reasoning_content" as const } : true,
    },
    cost: {
      input: cost.input,
      output: cost.output,
      cache: {
        read: cost.cache_read,
        write: cost.cache_write,
      },
    },
    limit: {
      context: meta?.limit?.context ?? DEFAULT_LIMIT.context,
      output: meta?.limit?.output ?? DEFAULT_LIMIT.output,
    },
    status: "active",
    options: {},
    headers: anthropic ? { "anthropic-beta": ANTHROPIC_BETA_HEADER } : {},
    release_date: "",
  };
}

export async function fetchModels(): Promise<Record<string, Model>> {
  const res = await fetch(HUB_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch CoreInfra prices: ${res.status} ${res.statusText}`,
    );
  }
  const data: PricesResponse = await res.json();

  const models: Record<string, Model> = {};

  for (const [provider, providerData] of Object.entries(data.providers)) {
    for (const [modelId, modelData] of Object.entries(providerData.models)) {
      models[modelId] = buildModel(modelId, provider, modelData.display_name);
    }
  }

  return models;
}
