import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildConfigModels,
  fetchModelsDevData,
  fetchHubModels,
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
        api: "https://hub.coreinfra.ai/codex/api/v1",
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
        api: "https://hub.coreinfra.ai/claude/api/v1",
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
        api: "https://hub.coreinfra.ai/claude/api/v1",
        npm: "@ai-sdk/anthropic",
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
      headers: {
        "anthropic-beta":
          "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
    });

    const dsFlash = models["deepseek-v4-flash"];
    expect(dsFlash).toEqual({
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      provider: {
        api: "https://hub.coreinfra.ai/claude/api/v1",
        npm: "@ai-sdk/anthropic",
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
      headers: {
        "anthropic-beta":
          "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
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
        api: "https://hub.coreinfra.ai/codex/api/v1",
        npm: "@ai-sdk/openai",
      },
      attachment: true,
      reasoning: true,
      temperature: true,
      tool_call: true,
      modalities: {
        input: ["text", "image", "audio", "video", "pdf"],
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
        google: {
          models: {
            "gemini-3-pro": { display_name: "Gemini 3 Pro" },
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
        google: {
          models: {
            "gemini-3-pro": { display_name: "Gemini 3 Pro" },
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

describe("fetchHubModels", () => {
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

  it("throws on non-ok response", async () => {
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
