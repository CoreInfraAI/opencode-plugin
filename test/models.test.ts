import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildConfigModels,
  fetchModelsDevData,
  fetchHubModels,
  listHubModels,
  resolveLegacyHubApiKey,
} from "../src/models.ts";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const MODELS_DEV_FIXTURE = {
  openai: {
    models: {
      "gpt-5.4-nano": {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        limit: { context: 400000, output: 128000 },
        attachment: true,
        reasoning: true,
        temperature: false,
        tool_call: true,
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        cost: { input: 0.2, output: 1.25, cache_read: 0.02, cache_write: 0 },
      },
    },
  },
  anthropic: {
    models: {
      "claude-sonnet-4-20250514": {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        limit: { context: 200000, output: 64000 },
        attachment: true,
        reasoning: true,
        temperature: true,
        tool_call: true,
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        cost: {
          input: 3,
          output: 15,
          cache_read: 0.3,
          cache_write: 3.75,
        },
      },
    },
  },
  deepseek: {
    models: {
      "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        limit: { context: 1000000, output: 384000 },
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        cost: { input: 1.5, output: 6, cache_read: 0.15, cache_write: 1.5 },
        interleaved: { field: "reasoning_content" },
      },
      "deepseek-v4-flash": {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        limit: { context: 1000000, output: 384000 },
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        cost: {
          input: 0.15,
          output: 0.6,
          cache_read: 0.015,
          cache_write: 0.15,
        },
        interleaved: { field: "reasoning_content" },
      },
    },
  },
};

const HUB_FIXTURE = {
  providers: {
    openai: {
      models: {
        "gpt-5.4-nano": { display_name: "GPT-5.4 Nano" },
      },
    },
    anthropic: {
      models: {
        "claude-sonnet-4-20250514": { display_name: "Claude Sonnet 4" },
      },
    },
    deepseek: {
      models: {
        "deepseek-v4-pro": { display_name: "DeepSeek V4 Pro" },
        "deepseek-v4-flash": { display_name: "DeepSeek V4 Flash" },
      },
    },
  },
};

describe("buildConfigModels", () => {
  it("intersects hub data with models.dev data", () => {
    const { models, warnings } = buildConfigModels(
      MODELS_DEV_FIXTURE,
      HUB_FIXTURE,
    );

    expect(warnings).toEqual([]);
    expect(Object.keys(models)).toHaveLength(4);

    const gpt = models["gpt-5.4-nano"];
    expect(gpt).toEqual({
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai",
      },
      attachment: true,
      reasoning: true,
      temperature: false,
      tool_call: true,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      cost: { input: 0.2, output: 1.25, cache_read: 0.02, cache_write: 0 },
      limit: { context: 400000, output: 128000 },
      interleaved: true,
      headers: {},
    });

    const claude = models["claude-sonnet-4-20250514"];
    expect(claude).toEqual({
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      provider: {
        api: "https://hub.coreinfra.ai/anthropic/api/v1",
        npm: "@ai-sdk/anthropic",
      },
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: {
        input: ["text", "image", "pdf"],
        output: ["text"],
      },
      cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      limit: { context: 200000, output: 64000 },
      interleaved: { field: "reasoning_content" },
      headers: {
        "anthropic-beta":
          "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
    });

    const dsPro = models["deepseek-v4-pro"];
    expect(dsPro).toEqual({
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      attachment: false,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      cost: { input: 1.5, output: 6, cache_read: 0.15, cache_write: 1.5 },
      limit: { context: 1000000, output: 384000 },
      interleaved: { field: "reasoning_content" },
      headers: {},
    });

    const dsFlash = models["deepseek-v4-flash"];
    expect(dsFlash).toEqual({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      attachment: false,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      cost: { input: 0.15, output: 0.6, cache_read: 0.015, cache_write: 0.15 },
      limit: { context: 1000000, output: 384000 },
      interleaved: { field: "reasoning_content" },
      headers: {},
    });
  });

  it("uses defaults and emits warning when model not in models.dev", () => {
    const hubData = {
      providers: {
        openai: {
          models: {
            "unknown-model": { display_name: "Unknown Model" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels({}, hubData);

    expect(warnings).toEqual([
      "openai/unknown-model not found in models.dev — using defaults",
    ]);
    expect(models["unknown-model"]).toEqual({
      id: "unknown-model",
      name: "Unknown Model",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai",
      },
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: {
        input: ["text", "image", "pdf"],
        output: ["text"],
      },
      cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      limit: { context: 200000, output: 64000 },
      interleaved: true,
      headers: {},
    });
  });

  it("resolves via full provider/modelId key", () => {
    const modelsDevData = {
      openai: {
        models: {
          "shared-id": {
            id: "shared-id",
            name: "OpenAI Shared",
            limit: { context: 100000, output: 32000 },
            tool_call: true,
            cost: { input: 1, output: 2 },
          },
        },
      },
    };

    const hubData = {
      providers: {
        openai: {
          models: {
            "shared-id": { display_name: "Hub Display Name" },
          },
        },
      },
    };

    const { models } = buildConfigModels(modelsDevData, hubData);

    expect(models["shared-id"].name).toBe("OpenAI Shared");
    expect(models["shared-id"].cost.input).toBe(1);
    expect(models["shared-id"].limit.context).toBe(100000);
  });

  it("skips unknown hub providers silently", () => {
    const hubData = {
      providers: {
        mistral: {
          models: {
            "mistral-large": { display_name: "Mistral Large" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels(MODELS_DEV_FIXTURE, hubData);

    expect(models).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("skips providers named like inherited object properties", () => {
    const hubData = {
      providers: {
        toString: {
          models: {
            "evil-model": { display_name: "Evil Model" },
          },
        },
        constructor: {
          models: {
            "ctor-model": { display_name: "Ctor Model" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels(MODELS_DEV_FIXTURE, hubData);

    expect(models).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("registers only known providers when hub mixes known and unknown", () => {
    const hubData = {
      providers: {
        openai: {
          models: {
            "gpt-5.4-nano": { display_name: "GPT-5.4 Nano" },
          },
        },
        mistral: {
          models: {
            "mistral-large": { display_name: "Mistral Large" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels(MODELS_DEV_FIXTURE, hubData);

    expect(Object.keys(models)).toEqual(["gpt-5.4-nano"]);
    expect(warnings).toEqual([]);
  });

  it("uses hub display_name as fallback when models.dev entry has no name", () => {
    const modelsDevData = {
      openai: {
        models: {
          "no-name-model": {
            limit: { context: 100000 },
            cost: { input: 1 },
          },
        },
      },
    };

    const hubData = {
      providers: {
        openai: {
          models: {
            "no-name-model": { display_name: "Hub Display Name" },
          },
        },
      },
    };

    const { models } = buildConfigModels(modelsDevData, hubData);
    expect(models["no-name-model"].name).toBe("Hub Display Name");
  });

  it("returns empty models for empty hub data", () => {
    const { models, warnings } = buildConfigModels(MODELS_DEV_FIXTURE, {
      providers: {},
    });

    expect(models).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("routes zai (GLM) through the openai chat-completions path", () => {
    const modelsDevData = {
      zai: {
        models: {
          "glm-5.2": {
            id: "glm-5.2",
            name: "GLM-5.2",
            limit: { context: 128000, output: 16000 },
            attachment: false,
            reasoning: true,
            temperature: true,
            tool_call: true,
            interleaved: { field: "reasoning_content" },
            modalities: { input: ["text"], output: ["text"] },
            cost: { input: 0.5, output: 2, cache_read: 0.05, cache_write: 0 },
          },
          "glm-4.7": {
            id: "glm-4.7",
            name: "GLM-4.7",
            limit: { context: 128000, output: 16000 },
            attachment: false,
            reasoning: true,
            temperature: true,
            tool_call: true,
            interleaved: { field: "reasoning_content" },
            modalities: { input: ["text"], output: ["text"] },
            cost: { input: 0.2, output: 0.8, cache_read: 0.02, cache_write: 0 },
          },
        },
      },
    };

    const hubData = {
      providers: {
        zai: {
          models: {
            "glm-5.2": { display_name: "GLM-5.2" },
            "glm-4.7": { display_name: "GLM-4.7" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels(modelsDevData, hubData);

    expect(warnings).toEqual([]);
    expect(Object.keys(models)).toHaveLength(2);

    expect(models["glm-5.2"]).toEqual({
      id: "glm-5.2",
      name: "GLM-5.2",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        // zai uses the openai-compatible SDK -> Chat Completions (/chat/completions),
        // NOT the openai SDK which would use the Responses API (/responses).
        npm: "@ai-sdk/openai-compatible",
      },
      attachment: false,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: { input: ["text"], output: ["text"] },
      cost: { input: 0.5, output: 2, cache_read: 0.05, cache_write: 0 },
      limit: { context: 128000, output: 16000 },
      interleaved: { field: "reasoning_content" },
      headers: {},
    });
  });

  it("merges Moonshot AI with OpenCode's built-in provider", () => {
    const modelsDevData = {
      moonshotai: {
        models: {
          "kimi-k3": {
            id: "kimi-k3",
            name: "Kimi K3",
            limit: { context: 1048576, output: 131072 },
            attachment: true,
            reasoning: true,
            temperature: false,
            tool_call: true,
            interleaved: { field: "reasoning_content" },
            modalities: {
              input: ["text", "image", "video"],
              output: ["text"],
            },
            cost: { input: 3, output: 15, cache_read: 0.3 },
          },
        },
      },
    };
    const hubData = {
      providers: {
        moonshotai: {
          models: {
            "kimi-k3": { display_name: "Kimi K3 from Hub" },
          },
        },
      },
    };

    const { models, warnings } = buildConfigModels(modelsDevData, hubData);

    expect(warnings).toEqual([]);
    expect(models["kimi-k3"]).toEqual({
      id: "kimi-k3",
      name: "Kimi K3",
      provider: {
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      attachment: true,
      reasoning: true,
      temperature: false,
      tool_call: true,
      modalities: {
        input: ["text", "image", "video"],
        output: ["text"],
      },
      cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 0 },
      limit: { context: 1048576, output: 131072 },
      interleaved: { field: "reasoning_content" },
      headers: {},
    });
  });

  // OpenCode 1 guesses chat efforts from the model ID and offered no "max" for
  // the Hub's deepseek-flash alias; the models.dev effort list is used instead.
  it("uses the models.dev effort list for chat-route variants", () => {
    const modelsDevData = {
      deepseek: {
        models: {
          "deepseek-flash": {
            name: "DeepSeek V4.1 Flash",
            reasoning_options: [
              { type: "toggle" },
              { type: "effort", values: ["low", "high", "max", null] },
            ],
          },
          "deepseek-plain": { name: "No reasoning options" },
        },
      },
      openai: {
        models: {
          "gpt-x": {
            name: "GPT X",
            reasoning_options: [{ type: "effort", values: ["low"] }],
          },
        },
      },
    };
    const hubData = {
      providers: {
        deepseek: {
          models: {
            "deepseek-flash": { display_name: "DeepSeek V4.1 Flash" },
            "deepseek-plain": { display_name: "Plain" },
          },
        },
        openai: { models: { "gpt-x": { display_name: "GPT X" } } },
      },
    };

    const { models } = buildConfigModels(modelsDevData, hubData);

    expect(models["deepseek-flash"]?.variants).toEqual({
      none: { disabled: true },
      minimal: { disabled: true },
      low: { reasoningEffort: "low" },
      medium: { disabled: true },
      high: { reasoningEffort: "high" },
      xhigh: { disabled: true },
      max: { reasoningEffort: "max" },
    });
    expect(models["deepseek-plain"]?.variants).toBeUndefined();
    expect(models["gpt-x"]?.variants).toBeUndefined();
  });

  it("hides efforts when reasoning_options has no effort", () => {
    const { models } = buildConfigModels(
      {
        zai: {
          models: { "glm-x": { reasoning_options: [{ type: "toggle" }] } },
        },
      },
      {
        providers: { zai: { models: { "glm-x": { display_name: "GLM X" } } } },
      },
    );

    expect(models["glm-x"]?.variants).toEqual({
      none: { disabled: true },
      minimal: { disabled: true },
      low: { disabled: true },
      medium: { disabled: true },
      high: { disabled: true },
      xhigh: { disabled: true },
      max: { disabled: true },
    });
  });

  it("routes xAI and Google through the Responses API", () => {
    const modelsDevData = {
      xai: {
        models: {
          "grok-4.7": {
            name: "Grok 4.7",
            reasoning: true,
            limit: { context: 500000, output: 500000 },
            reasoning_options: [
              { type: "effort", values: ["low", "medium", "high", "xhigh"] },
            ],
          },
          "grok-build-0.1": {
            name: "Grok Build 0.1",
            reasoning: true,
            reasoning_options: [],
          },
          "grok-4.20-0309-non-reasoning": {
            name: "Grok 4.20 (Non-Reasoning)",
            reasoning: false,
          },
        },
      },
      google: {
        models: {
          "gemini-4-argon": {
            name: "Gemini 4 Argon",
            reasoning: true,
            temperature: true,
            modalities: {
              input: ["text", "image", "video", "audio", "pdf"],
              output: ["text"],
            },
            reasoning_options: [
              { type: "effort", values: ["low", "medium", "high"] },
            ],
          },
        },
      },
    };
    const hubData = {
      providers: {
        xai: {
          models: {
            "grok-4.7": { display_name: "Grok 4.7" },
            "grok-build-0.1": { display_name: "Grok Build 0.1" },
            "grok-4.20-0309-non-reasoning": { display_name: "Grok 4.20" },
          },
        },
        google: {
          models: { "gemini-4-argon": { display_name: "Gemini 4 Argon" } },
        },
      },
    };

    const { models, warnings } = buildConfigModels(modelsDevData, hubData);
    const responses = (effort: string) => ({ reasoningEffort: effort });

    expect(warnings).toEqual([]);
    for (const id of Object.keys(models)) {
      expect(models[id].provider).toEqual({
        api: "https://hub.coreinfra.ai/openai/api/v1",
        npm: "@ai-sdk/openai",
      });
      expect(models[id].headers).toEqual({});
    }
    expect(models["grok-4.7"].options).toEqual({
      forceReasoning: true,
      reasoningSummary: "auto",
    });
    expect(models["grok-4.7"].limit).toEqual({
      context: 500000,
      output: 500000,
    });
    expect(models["grok-4.7"].variants).toEqual({
      none: { disabled: true },
      minimal: { disabled: true },
      low: responses("low"),
      medium: responses("medium"),
      high: responses("high"),
      xhigh: responses("xhigh"),
      max: { disabled: true },
    });
    expect(models["gemini-4-argon"].options).toEqual({
      forceReasoning: true,
      reasoningSummary: "auto",
    });
    expect(models["gemini-4-argon"].modalities.input).toEqual([
      "text",
      "image",
      "pdf",
    ]);
    expect(models["gemini-4-argon"].variants).toMatchObject({
      minimal: { disabled: true },
      low: responses("low"),
      medium: responses("medium"),
      high: responses("high"),
      xhigh: { disabled: true },
    });
    expect(
      Object.values(models["grok-build-0.1"].variants ?? {}).every(
        (variant) => "disabled" in variant,
      ),
    ).toBe(true);
    expect(models["grok-4.20-0309-non-reasoning"].options).toBeUndefined();
    expect(models["grok-4.20-0309-non-reasoning"].variants).toBeUndefined();
  });

  it("forces reasoning for non-OpenAI models", () => {
    const { models } = buildConfigModels(
      {
        openai: { models: { "gpt-x": { reasoning: true } } },
        google: { models: {} },
      },
      {
        providers: {
          openai: { models: { "gpt-x": { display_name: "GPT X" } } },
          google: { models: { "gemini-x": { display_name: "Gemini X" } } },
        },
      },
    );

    expect(models["gpt-x"].options).toBeUndefined();
    expect(models["gemini-x"].options).toEqual({
      forceReasoning: true,
      reasoningSummary: "auto",
    });
    expect(models["gemini-x"].variants).toEqual({
      none: { disabled: true },
      minimal: { disabled: true },
      low: { disabled: true },
      medium: { disabled: true },
      high: { disabled: true },
      xhigh: { disabled: true },
      max: { disabled: true },
    });
  });

  // Moonshot only accepts temperature 1; models.dev marking a Kimi model as
  // tunable made OpenCode's title agent send another value and fail.
  it("never lets OpenCode send a temperature to Moonshot", () => {
    const modelsDevData = {
      moonshotai: {
        models: { "kimi-k2.6": { name: "Kimi K2.6", temperature: true } },
      },
    };
    const hubData = {
      providers: {
        moonshotai: {
          models: { "kimi-k2.6": { display_name: "Kimi K2.6" } },
        },
      },
    };

    const { models } = buildConfigModels(modelsDevData, hubData);

    expect(models["kimi-k2.6"]?.temperature).toBe(false);
  });

  it("uses Responses API for openai but Chat Completions for zai", () => {
    const modelsDevData = {
      openai: { models: { "gpt-x": { name: "GPT X" } } },
      zai: { models: { "glm-x": { name: "GLM X" } } },
    };
    const hubData = {
      providers: {
        openai: { models: { "gpt-x": { display_name: "GPT X" } } },
        zai: { models: { "glm-x": { display_name: "GLM X" } } },
      },
    };
    const { models } = buildConfigModels(modelsDevData, hubData);

    // openai -> @ai-sdk/openai (Responses API, /responses)
    expect(models["gpt-x"].provider.npm).toBe("@ai-sdk/openai");
    // zai -> @ai-sdk/openai-compatible (Chat Completions, /chat/completions)
    expect(models["glm-x"].provider.npm).toBe("@ai-sdk/openai-compatible");
    // both share the same hub base URL (the hub routes by model name)
    expect(models["gpt-x"].provider.api).toBe(models["glm-x"].provider.api);
  });

  it("respects models.dev interleaved and falls back per protocol", () => {
    // openai-protocol zai model: explicit interleaved wins over protocol default
    const explicit = buildConfigModels(
      {
        zai: {
          models: {
            "glm-5.2": {
              name: "GLM-5.2",
              interleaved: { field: "reasoning_content" },
            },
          },
        },
      },
      {
        providers: {
          zai: { models: { "glm-5.2": { display_name: "GLM-5.2" } } },
        },
      },
    );
    expect(explicit.models["glm-5.2"].interleaved).toEqual({
      field: "reasoning_content",
    });

    // openai-protocol zai model without interleaved -> default true
    const openaiFallback = buildConfigModels(
      { zai: { models: { "glm-4.5": { name: "GLM-4.5" } } } },
      {
        providers: {
          zai: { models: { "glm-4.5": { display_name: "GLM-4.5" } } },
        },
      },
    );
    expect(openaiFallback.models["glm-4.5"].interleaved).toBe(true);

    // anthropic-protocol model without interleaved -> default reasoning_content field
    const anthropicFallback = buildConfigModels(
      { anthropic: { models: { "claude-x": { name: "Claude X" } } } },
      {
        providers: {
          anthropic: {
            models: { "claude-x": { display_name: "Claude X" } },
          },
        },
      },
    );
    expect(anthropicFallback.models["claude-x"].interleaved).toEqual({
      field: "reasoning_content",
    });
  });
});

describe("fetchModelsDevData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads from cache file when available", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ openai: { models: {} } }),
    );

    const data = await fetchModelsDevData();
    expect(data).toEqual({ openai: { models: {} } });
  });

  it("falls back to network fetch when cache missing", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ openai: { models: {} } }),
      }),
    );

    const data = await fetchModelsDevData();
    expect(data).toEqual({ openai: { models: {} } });
  });

  it("throws on non-ok network response", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(fetchModelsDevData()).rejects.toThrow(
      "Failed to fetch models.dev: 503 Service Unavailable",
    );
  });
});

describe("resolveLegacyHubApiKey", () => {
  const AUTH_STORE = {
    coreinfra: { type: "api", key: "stored-key" },
    other: { type: "api", key: "other-key" },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HUB_FIXTURE),
      }),
    );
  });

  async function expectAuthHeader(key?: string) {
    await expect(
      fetchHubModels(await resolveLegacyHubApiKey()),
    ).resolves.toEqual(HUB_FIXTURE);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://hub.coreinfra.ai/hub/api/prices",
      {
        headers: key ? { "X-CoreInfra-Api-Key": key } : undefined,
        signal: expect.any(AbortSignal),
      },
    );
  }

  it("prefers COREINFRA_API_KEY over the auth store", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(AUTH_STORE));
    vi.stubEnv("COREINFRA_API_KEY", "env-key");

    await expectAuthHeader("env-key");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("trims COREINFRA_API_KEY", async () => {
    vi.stubEnv("COREINFRA_API_KEY", "  env-key  ");

    await expectAuthHeader("env-key");
  });

  it("falls back to the coreinfra entry in the auth store", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(AUTH_STORE));
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader("stored-key");
  });

  it("ignores a blank env var and falls through to the auth store", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(AUTH_STORE));
    vi.stubEnv("COREINFRA_API_KEY", "   ");

    await expectAuthHeader("stored-key");
  });

  it("sends no auth header when the auth store file is missing", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader();
  });

  it("sends no auth header on invalid JSON", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue("not json");
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader();
  });

  it("sends no auth header when there is no coreinfra entry", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ other: { type: "api", key: "other-key" } }),
    );
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader();
  });

  it("sends no auth header when the entry type is not api", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ coreinfra: { type: "oauth", key: "token" } }),
    );
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader();
  });

  it("sends no auth header when the stored key is blank", async () => {
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ coreinfra: { type: "api", key: "   " } }),
    );
    vi.stubEnv("COREINFRA_API_KEY", "");

    await expectAuthHeader();
  });
});

describe("fetchHubModels", () => {
  beforeEach(async () => {
    vi.stubEnv("COREINFRA_API_KEY", "");
    const { readFile } = await import("node:fs/promises");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches hub prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HUB_FIXTURE),
      }),
    );

    const data = await fetchHubModels();
    expect(data).toEqual(HUB_FIXTURE);
  });

  it("sends the key in X-CoreInfra-Api-Key when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(HUB_FIXTURE),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHubModels("test-key")).resolves.toEqual(HUB_FIXTURE);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { "X-CoreInfra-Api-Key": "test-key" },
      signal: expect.any(AbortSignal),
    });
  });

  // OpenCode 2 passes the key from its own credential store; the fetcher must
  // never fall back to the OpenCode 1 environment or auth.json lookup.
  it("does not resolve a key on its own", async () => {
    vi.stubEnv("COREINFRA_API_KEY", "env-key");
    const { readFile } = await import("node:fs/promises");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(HUB_FIXTURE),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchHubModels();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("sends no auth header without a key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(HUB_FIXTURE),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchHubModels();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: undefined,
      signal: expect.any(AbortSignal),
    });
  });

  it("throws the generic error on 401 when a key was sent", async () => {
    vi.stubEnv("COREINFRA_API_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    await expect(fetchHubModels()).rejects.toThrow(
      "Failed to fetch CoreInfra prices: 401 Unauthorized",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic error on 401 without a key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    await expect(fetchHubModels()).rejects.toThrow(
      "Failed to fetch CoreInfra prices: 401 Unauthorized",
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubEnv("COREINFRA_API_KEY", "secret-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(fetchHubModels()).rejects.toThrow(
      "Failed to fetch CoreInfra prices: 500 Internal Server Error",
    );
  });
});

describe("listHubModels", () => {
  it("routes each known provider to its native OpenCode 2 package", () => {
    expect(listHubModels(HUB_FIXTURE)).toEqual([
      {
        provider: "openai",
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        package: "@opencode/ai/providers/openai",
        api: "https://hub.coreinfra.ai/openai/api/v1",
        headers: {},
      },
      {
        provider: "anthropic",
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        package: "@opencode/ai/providers/anthropic",
        api: "https://hub.coreinfra.ai/anthropic/api/v1",
        headers: {
          "anthropic-beta":
            "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        },
      },
      {
        provider: "deepseek",
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        package: "@opencode/ai/providers/openai-compatible",
        api: "https://hub.coreinfra.ai/openai/api/v1",
        headers: {},
      },
      {
        provider: "deepseek",
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        package: "@opencode/ai/providers/openai-compatible",
        api: "https://hub.coreinfra.ai/openai/api/v1",
        headers: {},
      },
    ]);
  });

  it("routes xAI and Google to their own OpenCode 2 packages and Google to /google/api/v1beta", () => {
    expect(
      listHubModels({
        providers: {
          xai: { models: { "grok-4.7": { display_name: "Grok 4.7" } } },
          google: {
            models: { "gemini-4-argon": { display_name: "Gemini 4 Argon" } },
          },
        },
      }),
    ).toEqual([
      {
        provider: "xai",
        id: "grok-4.7",
        name: "Grok 4.7",
        package: "@opencode/ai/providers/xai",
        api: "https://hub.coreinfra.ai/openai/api/v1",
        headers: {},
      },
      {
        provider: "google",
        id: "gemini-4-argon",
        name: "Gemini 4 Argon",
        package: "@opencode/ai/providers/google/interactions",
        api: "https://hub.coreinfra.ai/google/api/v1beta",
        headers: {},
      },
    ]);
  });

  it("skips unknown providers", () => {
    expect(
      listHubModels({
        providers: { mistery: { models: { m: { display_name: "M" } } } },
      }),
    ).toEqual([]);
  });
});
