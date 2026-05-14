import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";

import mod from "../src/index.ts";

const plugin = mod.server;

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

function mockInput(): PluginInput {
  const log = vi.fn().mockResolvedValue(undefined);
  return {
    client: {
      app: { log },
    },
    project: {} as PluginInput["project"],
    directory: "/tmp",
    worktree: "/tmp",
    serverUrl: new URL("http://localhost:3000"),
    $: {} as PluginInput["$"],
  };
}

const MODELS_DEV_DATA = {
  openai: {
    models: {
      "gpt-5.4-nano": {
        id: "gpt-5.4-nano",
        name: "GPT-5.4 Nano",
        limit: { context: 400000, output: 128000 },
        attachment: true,
        reasoning: false,
        temperature: true,
        tool_call: true,
        modalities: {
          input: ["text", "image", "audio"],
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
};

function hubResponse() {
  return {
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
    },
  };
}

async function setupFetchMocks(opts?: {
  modelsDevData?: object;
  hubData?: object;
  fetchError?: Error;
}) {
  const { readFile } = await import("node:fs/promises");
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify(opts?.modelsDevData ?? MODELS_DEV_DATA),
  );

  if (opts?.fetchError) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(opts.fetchError));
  } else {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const data = url.includes("models.dev")
          ? (opts?.modelsDevData ?? MODELS_DEV_DATA)
          : (opts?.hubData ?? hubResponse());
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue(data),
        });
      }),
    );
  }
}

describe("config hook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("populates config with full capabilities from models.dev", async () => {
    await setupFetchMocks();

    const hooks: Hooks = await plugin(mockInput());
    const config = { provider: {} } as Parameters<
      NonNullable<Hooks["config"]>
    >[0];

    await hooks.config?.(config);

    expect(config.provider?.coreinfra?.name).toBe("CoreInfra AI Hub");
    const models = config.provider?.coreinfra?.models ?? {};

    expect(models["gpt-5.4-nano"]).toEqual({
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      provider: {
        api: "https://hub.coreinfra.ai/codex/api/v1",
        npm: "@ai-sdk/openai",
      },
      attachment: true,
      reasoning: false,
      temperature: true,
      tool_call: true,
      modalities: { input: ["text", "image", "audio"], output: ["text"] },
      cost: { input: 0.2, output: 1.25, cache_read: 0.02, cache_write: 0 },
      limit: { context: 400000, output: 128000 },
      interleaved: true,
      headers: {},
    });

    expect(models["claude-sonnet-4-20250514"]).toEqual({
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
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      limit: { context: 200000, output: 64000 },
      interleaved: { field: "reasoning_content" },
      headers: {
        "anthropic-beta":
          "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
    });
  });

  it("uses defaults when models.dev has no matching model", async () => {
    await setupFetchMocks({ modelsDevData: {} });

    const hooks: Hooks = await plugin(mockInput());
    const config = { provider: {} } as Parameters<
      NonNullable<Hooks["config"]>
    >[0];

    await hooks.config?.(config);

    const models = config.provider?.coreinfra?.models ?? {};
    expect(models["gpt-5.4-nano"]).toEqual(
      expect.objectContaining({
        reasoning: true,
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        limit: { context: 200000, output: 64000 },
      }),
    );
  });

  it("leaves models empty on fetchModels failure", async () => {
    await setupFetchMocks({ fetchError: new Error("network down") });

    const hooks: Hooks = await plugin(mockInput());
    const config = { provider: {} } as Parameters<
      NonNullable<Hooks["config"]>
    >[0];

    await hooks.config?.(config);

    expect(config.provider?.coreinfra?.name).toBe("CoreInfra AI Hub");
    expect(config.provider?.coreinfra?.models).toBeUndefined();
  });
});

describe("auth hook", () => {
  it("returns apiKey from auth loader", async () => {
    await setupFetchMocks({ hubData: { providers: {} } });
    const hooks: Hooks = await plugin(mockInput());
    const getAuth = vi.fn().mockResolvedValue({ type: "api", key: "sk-test" });
    const providerArg = {} as Parameters<
      NonNullable<Hooks["auth"]>["loader"]
    >[1];
    const result = await hooks.auth?.loader?.(getAuth, providerArg);
    expect(result).toEqual({ apiKey: "sk-test" });
  });

  it("returns empty object when no auth", async () => {
    await setupFetchMocks({ hubData: { providers: {} } });
    const hooks: Hooks = await plugin(mockInput());
    const getAuth = vi.fn().mockResolvedValue(null);
    const providerArg = {} as Parameters<
      NonNullable<Hooks["auth"]>["loader"]
    >[1];
    const result = await hooks.auth?.loader?.(getAuth, providerArg);
    expect(result).toEqual({});
  });
});
