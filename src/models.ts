import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { xdgCache, xdgData } from "xdg-basedir";

export const PROVIDER_ID = "coreinfra";
export const PROVIDER_NAME = "CoreInfra AI Hub";

const FETCH_TIMEOUT_MS = 10_000;
const CACHE_PATH = join(
  xdgCache ?? join(homedir(), ".cache"),
  "opencode",
  "models.json",
);
const AUTH_PATH = join(
  xdgData ?? join(homedir(), ".local", "share"),
  "opencode",
  "auth.json",
);
const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_HUB_BASE = "https://hub.coreinfra.ai";
const HUB_URL = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/hub/api/prices`;
const OPENAI_BASE = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/openai/api/v1`;
const ANTHROPIC_BASE = `${process.env.COREINFRA_HUB_BASE_URL ?? DEFAULT_HUB_BASE}/anthropic/api/v1`;
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

type Protocol = "openai" | "anthropic";

// Providers we explicitly know how to route. Models from any provider not
// listed here are skipped. Adding a provider is a one-line change here. The
// `npm` package selects the wire API: `@ai-sdk/openai` targets OpenAI's
// Responses API (`/responses`), while `@ai-sdk/openai-compatible` targets the
// Chat Completions API (`/chat/completions`).
const PROVIDERS = new Map<
  string,
  { protocol: Protocol; npm: string; temperature?: false }
>([
  ["openai", { protocol: "openai", npm: "@ai-sdk/openai" }],
  ["anthropic", { protocol: "anthropic", npm: "@ai-sdk/anthropic" }],
  // DeepSeek must use Chat Completions, not the Anthropic protocol: the
  // Anthropic message format drops reasoning blocks that carry no signature,
  // and DeepSeek never issues one. A reasoning-only assistant turn then lowers
  // to `content: []` and the API rejects the whole request with "all messages
  // must have non-empty content", while `reasoning_content` never survives the
  // round-trip that DeepSeek's thinking mode requires.
  ["deepseek", { protocol: "openai", npm: "@ai-sdk/openai-compatible" }],
  ["zai", { protocol: "openai", npm: "@ai-sdk/openai-compatible" }],
  // Moonshot rejects any temperature other than 1 ("only 1 is allowed for this
  // model"), yet models.dev marks some Kimi models as tunable. OpenCode's title
  // agent then sends its own temperature and title generation fails, so never
  // send one and let the API use its default.
  [
    "moonshotai",
    {
      protocol: "openai",
      npm: "@ai-sdk/openai-compatible",
      temperature: false,
    },
  ],
]);

type ModelDevEntry = {
  id?: string;
  name?: string;
  limit?: { context?: number; output?: number };
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  interleaved?: boolean | { field: string };
  modalities?: { input?: string[]; output?: string[] };
  reasoning_options?: { type: string; values?: (string | null)[] }[];
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

type ConfigModel = {
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
  variants?: Record<string, { reasoningEffort: string } | { disabled: true }>;
};

// Every effort name OpenCode 1 may generate on its own for a chat model.
const KNOWN_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

// The reasoning efforts models.dev lists for a model. "none" is left out: on
// chat routes it means turning thinking off, which is not an effort setting.
function reasoningEfforts(entry: ModelDevEntry | null) {
  const values = entry?.reasoning_options?.find(
    (option) => option.type === "effort",
  )?.values;
  return values?.filter(
    (value): value is string => typeof value === "string" && value !== "none",
  );
}

// OpenCode 1 guesses chat-model efforts from the model ID (e.g. it only offers
// "max" for IDs containing "deepseek-v4"), so a Hub alias like deepseek-flash
// gets the wrong menu. Use the efforts models.dev lists and hide the rest.
function chatVariants(entry: ModelDevEntry | null) {
  const efforts = reasoningEfforts(entry);
  if (!efforts?.length) return undefined;
  return Object.fromEntries(
    [...new Set([...KNOWN_EFFORTS, ...efforts])].map((effort) => [
      effort,
      efforts.includes(effort)
        ? { reasoningEffort: effort }
        : { disabled: true as const },
    ]),
  );
}

function buildLookupMap(modelsDevData: ModelsDevData) {
  const byFullId = new Map<string, ModelDevEntry>();

  for (const [provider, providerData] of Object.entries(modelsDevData)) {
    if (!PROVIDERS.has(provider) || !providerData?.models) continue;
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

type AuthStore = { [provider: string]: { type?: string; key?: string } };

// OpenCode 1 only. The config hook runs before OpenCode consults our
// auth.loader, so the key has to be resolved independently: first from the
// environment, then from the auth store OpenCode 1 writes for `opencode auth
// login`. Every failure on the store path (missing file, bad JSON, no usable
// entry) means "no key". OpenCode 2 keeps credentials in its database and only
// imports auth.json once, so it must never use this.
export async function resolveLegacyHubApiKey(): Promise<string | undefined> {
  const fromEnv = process.env.COREINFRA_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = await readFile(AUTH_PATH, "utf-8");
    const store = JSON.parse(raw) as AuthStore;
    const entry = store[PROVIDER_ID];
    const key = entry?.type === "api" ? entry.key?.trim() : undefined;
    if (key) return key;
  } catch {
    // best-effort: anything wrong here just means no key
  }
  return undefined;
}

export async function fetchHubModels(apiKey?: string): Promise<HubResponse> {
  const res = await fetch(HUB_URL, {
    headers: apiKey ? { "X-CoreInfra-Api-Key": apiKey } : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch CoreInfra prices: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<HubResponse>;
}

export function buildConfigModels(
  modelsDevData: ModelsDevData,
  hubData: HubResponse,
): { models: Record<string, ConfigModel>; warnings: string[] } {
  const byFullId = buildLookupMap(modelsDevData);
  const models: Record<string, ConfigModel> = {};
  const warnings: string[] = [];

  for (const [provider, providerData] of Object.entries(hubData.providers)) {
    const known = PROVIDERS.get(provider);
    if (!known || !providerData?.models) continue;

    const anthropic = known.protocol === "anthropic";

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
          npm: known.npm,
        },
        attachment: entry?.attachment ?? DEFAULT_CAPS.attachment,
        reasoning: entry?.reasoning ?? DEFAULT_CAPS.reasoning,
        temperature:
          known.temperature ?? entry?.temperature ?? DEFAULT_CAPS.temperature,
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
        interleaved:
          entry?.interleaved ??
          (anthropic ? { field: "reasoning_content" } : true),
        headers: anthropic ? { "anthropic-beta": ANTHROPIC_BETA_HEADER } : {},
      };
      const variants =
        known.npm === "@ai-sdk/openai-compatible"
          ? chatVariants(entry)
          : undefined;
      if (variants) models[modelId].variants = variants;
    }
  }

  return { models, warnings };
}

// OpenCode 2 ships its own native protocol implementations instead of loading
// AI SDK packages. Naming them explicitly matters: a provider registered from a
// plugin is not rewritten from `aisdk:` packages the way config providers are.
const NATIVE_PACKAGES: Record<string, string> = {
  "@ai-sdk/openai": "@opencode/ai/providers/openai",
  "@ai-sdk/anthropic": "@opencode/ai/providers/anthropic",
  "@ai-sdk/openai-compatible": "@opencode/ai/providers/openai-compatible",
};

export type HubModel = {
  provider: string;
  id: string;
  name: string;
  package: string;
  api: string;
  headers: Record<string, string>;
};

// Every Hub model we know how to route, in the protocol-neutral shape the
// OpenCode 2 mapper consumes. The Hub listing is authoritative for which
// models exist; capability metadata is resolved separately.
export function listHubModels(hubData: HubResponse): HubModel[] {
  const models: HubModel[] = [];
  for (const [provider, providerData] of Object.entries(hubData.providers)) {
    const known = PROVIDERS.get(provider);
    const pkg = known && NATIVE_PACKAGES[known.npm];
    if (!known || !pkg || !providerData?.models) continue;
    const anthropic = known.protocol === "anthropic";
    for (const [id, hubModel] of Object.entries(providerData.models)) {
      models.push({
        provider,
        id,
        name: hubModel.display_name,
        package: pkg,
        api: anthropic ? ANTHROPIC_BASE : OPENAI_BASE,
        headers: anthropic ? { "anthropic-beta": ANTHROPIC_BETA_HEADER } : {},
      });
    }
  }
  return models;
}
