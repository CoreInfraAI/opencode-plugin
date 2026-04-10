#!/usr/bin/env bun
/**
 * Fetches model metadata, limits, capabilities, and prices from models.dev and
 * intersects that data with hub.coreinfra.ai/hub/api/prices, then writes
 * models.json to the repo root.
 *
 * Usage: bun scripts/fetch-models.ts
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelDevEntry = {
  id: string;
  name: string;
  limit?: { context?: number; output?: number };
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
};

type ModelDevResponse = {
  [provider: string]: {
    models: {
      [modelId: string]: ModelDevEntry;
    };
  };
};

type HubModelEntry = {
  display_name: string;
  prices: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens?: number;
    cache_5m_write_tokens?: number;
  };
};

type HubResponse = {
  providers: {
    [provider: string]: {
      models: {
        [modelId: string]: HubModelEntry;
      };
    };
  };
};

type ModelOutput = {
  name: string;
  limit: { context: number; output: number };
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  cost: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
};

type ModelsJson = {
  models: Record<string, ModelOutput>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS_DEV_URL = "https://models.dev/api.json";
const HUB_URL = "https://hub.coreinfra.ai/hub/api/prices";

const DEFAULT_LIMITS = { context: 200000, output: 64000 };
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

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Build lookup maps from models.dev response
// ---------------------------------------------------------------------------

type LookupValue = ModelDevEntry | "ambiguous";

function buildLookupMaps(modelsDevData: ModelDevResponse): {
  byFullId: Map<string, ModelDevEntry>;
  byBareId: Map<string, LookupValue>;
} {
  const byFullId = new Map<string, ModelDevEntry>();
  const byBareId = new Map<string, LookupValue>();

  for (const [provider, providerData] of Object.entries(modelsDevData)) {
    if (!providerData?.models) continue;
    for (const [modelId, entry] of Object.entries(providerData.models)) {
      // Full key: "provider/modelId"
      byFullId.set(`${provider}/${modelId}`, entry);

      // Bare key: mark as ambiguous if already seen
      if (byBareId.has(modelId)) {
        byBareId.set(modelId, "ambiguous");
      } else {
        byBareId.set(modelId, entry);
      }
    }
  }

  return { byFullId, byBareId };
}

// ---------------------------------------------------------------------------
// Resolve a single hub model against the lookup maps
// ---------------------------------------------------------------------------

function resolveEntry(
  provider: string,
  modelId: string,
  byFullId: Map<string, ModelDevEntry>,
  byBareId: Map<string, LookupValue>,
): ModelDevEntry | null {
  // 1. Try "provider/modelId"
  const fullKey = `${provider}/${modelId}`;
  const fullEntry = byFullId.get(fullKey);
  if (fullEntry !== undefined) {
    return fullEntry;
  }

  // 2. Try bare ID in byBareId — only if not ambiguous
  const bareValue = byBareId.get(modelId);
  if (bareValue !== undefined && bareValue !== "ambiguous") {
    return bareValue;
  }

  return null;
}

function extractCost(entry?: ModelDevEntry): ModelOutput["cost"] {
  return {
    input: entry?.cost?.input ?? DEFAULT_COST.input,
    output: entry?.cost?.output ?? DEFAULT_COST.output,
    cache_read: entry?.cost?.cache_read ?? DEFAULT_COST.cache_read,
    cache_write: entry?.cost?.cache_write ?? DEFAULT_COST.cache_write,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Fetch both APIs in parallel
  let modelsDevData: ModelDevResponse;
  let hubData: HubResponse;

  try {
    [modelsDevData, hubData] = await Promise.all([
      fetchJson<ModelDevResponse>(MODELS_DEV_URL),
      fetchJson<HubResponse>(HUB_URL),
    ]);
  } catch (err) {
    console.error("Fatal: API fetch failed:", (err as Error).message);
    process.exit(1);
  }

  const { byFullId, byBareId } = buildLookupMaps(modelsDevData);

  type PendingEntry = {
    provider: string;
    modelId: string;
    output: ModelOutput;
  };
  const pending: PendingEntry[] = [];
  const missingIds: string[] = [];

  for (const [provider, providerData] of Object.entries(hubData.providers)) {
    if (!providerData?.models) continue;

    for (const [modelId, hubModel] of Object.entries(providerData.models)) {
      const entry = resolveEntry(provider, modelId, byFullId, byBareId);

      if (!entry) {
        console.error(
          `⚠️  ${provider}/${modelId} not found in models.dev — using default limits (context: ${DEFAULT_LIMITS.context}, output: ${DEFAULT_LIMITS.output})`,
        );
        missingIds.push(`${provider}/${modelId}`);
      }

      const output: ModelOutput = !entry
        ? {
            name: hubModel.display_name,
            limit: DEFAULT_LIMITS,
            ...DEFAULT_CAPS,
            cost: DEFAULT_COST,
          }
        : {
            name: entry.name ?? hubModel.display_name,
            limit: {
              context: entry.limit?.context ?? DEFAULT_LIMITS.context,
              output: entry.limit?.output ?? DEFAULT_LIMITS.output,
            },
            attachment: entry.attachment ?? DEFAULT_CAPS.attachment,
            reasoning: entry.reasoning ?? DEFAULT_CAPS.reasoning,
            temperature: DEFAULT_CAPS.temperature,
            tool_call: entry.tool_call ?? DEFAULT_CAPS.tool_call,
            cost: extractCost(entry),
          };

      pending.push({ provider, modelId, output });
    }
  }

  // Sort by provider then model ID for stable, deterministic output
  pending.sort((a, b) => {
    const byCmp = a.provider.localeCompare(b.provider);
    return byCmp !== 0 ? byCmp : a.modelId.localeCompare(b.modelId);
  });

  const outputModels: Record<string, ModelOutput> = {};
  for (const { provider, modelId, output } of pending) {
    // Warn if this bare ID is already present (last-write-wins collision)
    if (outputModels[modelId] !== undefined) {
      console.error(
        `Warning: bare model ID "${modelId}" collision from provider "${provider}" (overwriting previous entry)`,
      );
    }
    outputModels[modelId] = output;
  }

  const result: ModelsJson = {
    models: outputModels,
  };

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, "..", "models.json");

  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

  if (missingIds.length > 0) {
    console.error(
      `\nWarning: ${missingIds.length} hub model(s) not found in models.dev (defaults used):`,
    );
    for (const id of missingIds) {
      console.error(`  - ${id}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Written: ${outPath} (${Object.keys(outputModels).length} models)`,
  );
}

main();
