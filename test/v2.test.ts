import { describe, expect, it, vi } from "vitest";
import type { Model } from "@opencode/plugin";
import type { ProviderRecord } from "@opencode/plugin/promise/provider";

import mod from "../src/index.ts";
import type { HubModel } from "../src/models.ts";
import { setup, toV2Model } from "../src/v2.ts";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const HUB = {
  providers: {
    openai: { models: { "gpt-5.4-nano": { display_name: "GPT-5.4 Nano" } } },
    anthropic: {
      models: { "claude-sonnet-4-5": { display_name: "Claude Sonnet 4.5" } },
    },
  },
};

const OPENAI_HUB: HubModel = {
  provider: "openai",
  id: "gpt-5.4-nano",
  name: "Hub GPT",
  package: "@opencode/ai/providers/openai",
  api: "https://hub.coreinfra.ai/openai/api/v1",
  headers: {},
};

const DEEPSEEK_HUB: HubModel = {
  provider: "deepseek",
  id: "deepseek-v4-pro",
  name: "Hub DeepSeek",
  package: "@opencode/ai/providers/openai-compatible",
  api: "https://hub.coreinfra.ai/openai/api/v1",
  headers: {},
};

function upstreamModel(overrides: Partial<Model.Info> = {}): Model.Info {
  return {
    id: "gpt-5.4-nano",
    modelID: "gpt-5.4-nano",
    providerID: "openai",
    name: "GPT-5.4 Nano",
    family: "gpt",
    capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
    variants: [
      {
        id: "high",
        settings: {
          reasoningEffort: "high",
          reasoningSummary: "auto",
          baseURL: "https://evil.example",
          apiKey: "leak",
        },
        headers: { "x-upstream": "1" },
        body: { extra: true },
      },
    ],
    time: { released: 1700000000000 },
    cost: [{ input: 0.2, output: 1.25, cache: { read: 0.02, write: 0 } }],
    status: "active",
    enabled: false,
    limit: { context: 400000, output: 128000 },
    settings: { baseURL: "https://api.openai.com/v1" },
    headers: { "x-upstream": "1" },
    ...overrides,
  } as Model.Info;
}

function record(
  models: Model.Info[],
  providerPackage = "@opencode/ai/providers/openai",
): ProviderRecord {
  return {
    provider: {
      id: models[0]?.providerID ?? "openai",
      name: "Upstream",
      activation: "auto",
      package: providerPackage,
    },
    models: new Map(models.map((model) => [model.id, model])),
  } as ProviderRecord;
}

describe("toV2Model", () => {
  it("copies upstream metadata but keeps Hub identity and routing", () => {
    const model = toV2Model(OPENAI_HUB, record([upstreamModel()]));

    expect(model).toEqual({
      id: "gpt-5.4-nano",
      modelID: "gpt-5.4-nano",
      providerID: "coreinfra",
      name: "GPT-5.4 Nano",
      family: "gpt",
      package: "@opencode/ai/providers/openai",
      settings: { baseURL: "https://hub.coreinfra.ai/openai/api/v1" },
      headers: {},
      capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
      variants: [
        {
          id: "high",
          settings: { reasoningEffort: "high", reasoningSummary: "auto" },
        },
      ],
      time: { released: 1700000000000 },
      cost: [{ input: 0.2, output: 1.25, cache: { read: 0.02, write: 0 } }],
      status: "active",
      enabled: true,
      limit: { context: 400000, output: 128000 },
    });
  });

  it("does not share mutable state with the upstream record", () => {
    const upstream = upstreamModel();
    const model = toV2Model(OPENAI_HUB, record([upstream]));

    expect(model.capabilities).not.toBe(upstream.capabilities);
    expect(model.cost).not.toBe(upstream.cost);
    expect(model.limit).not.toBe(upstream.limit);
  });

  it("treats an inherited provider package as the same package", () => {
    const model = toV2Model(
      OPENAI_HUB,
      record([upstreamModel({ package: undefined })]),
    );
    expect(model.variants).toHaveLength(1);
  });

  it("keeps metadata and only effort variants on chat routes", () => {
    const upstream = upstreamModel({
      id: "deepseek-v4-pro" as Model.ID,
      providerID: "deepseek" as Model.Info["providerID"],
      name: "DeepSeek V4 Pro",
      package: undefined,
      compatibility: { reasoningField: "reasoning_content" },
      limit: { context: 1000000, output: 384000 },
      variants: [
        { id: "none", body: { thinking: { type: "disabled" } } },
        {
          id: "max",
          settings: { reasoningEffort: "max" },
          body: { thinking: { type: "enabled" } },
        },
        { id: "thinking", settings: { thinking: { type: "enabled" } } },
      ] as Model.Variant[],
    });
    const model = toV2Model(
      DEEPSEEK_HUB,
      record([upstream], "@opencode/ai/providers/deepseek"),
    );

    expect(model.variants).toEqual([
      { id: "max", settings: { reasoningEffort: "max" } },
    ]);
    expect(model.name).toBe("DeepSeek V4 Pro");
    expect(model.limit).toEqual({ context: 1000000, output: 384000 });
    expect(model.compatibility).toEqual({
      reasoningField: "reasoning_content",
    });
    expect(model.settings).toEqual({
      baseURL: "https://hub.coreinfra.ai/openai/api/v1",
      provider: "deepseek",
    });
  });

  it("maps Gemini thinking variants to Interactions options", () => {
    const upstream = upstreamModel({
      id: "gemini-4-argon" as Model.ID,
      providerID: "google" as Model.Info["providerID"],
      name: "Gemini 4 Argon",
      package: undefined,
      capabilities: {
        tools: true,
        input: ["text", "image", "video", "audio", "pdf"],
        output: ["text"],
      },
      variants: [
        {
          id: "none",
          settings: {
            thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
          },
        },
        {
          id: "low",
          settings: {
            thinkingConfig: { includeThoughts: true, thinkingLevel: "low" },
            baseURL: "https://evil.example",
          },
          headers: { "x-upstream": "1" },
        },
        {
          id: "high",
          settings: {
            thinkingConfig: { includeThoughts: true, thinkingLevel: "high" },
          },
        },
      ] as Model.Variant[],
    });
    const model = toV2Model(
      {
        provider: "google",
        id: "gemini-4-argon",
        name: "Hub Gemini",
        package: "@opencode/ai/providers/google/interactions",
        api: "https://hub.coreinfra.ai/google/api/v1beta",
        headers: {},
      },
      record([upstream], "@opencode/ai/providers/google"),
    );

    expect(model.name).toBe("Gemini 4 Argon");
    expect(model.package).toBe("@opencode/ai/providers/google/interactions");
    expect(model.settings).toEqual({
      baseURL: "https://hub.coreinfra.ai/google/api/v1beta",
      thinkingSummaries: "auto",
    });
    expect(model.capabilities.input).toEqual(["text", "image", "pdf"]);
    expect(model.variants).toEqual([
      { id: "low", settings: { thinkingLevel: "low" } },
      { id: "high", settings: { thinkingLevel: "high" } },
    ]);
  });

  it("keeps native xAI variants", () => {
    const upstream = upstreamModel({
      id: "grok-4.7" as Model.ID,
      providerID: "xai" as Model.Info["providerID"],
      name: "Grok 4.7",
      package: undefined,
    });
    const model = toV2Model(
      {
        provider: "xai",
        id: "grok-4.7",
        name: "Hub Grok",
        package: "@opencode/ai/providers/xai",
        api: "https://hub.coreinfra.ai/openai/api/v1",
        headers: {},
      },
      record([upstream], "@opencode/ai/providers/xai"),
    );

    expect(model.settings).toEqual({
      baseURL: "https://hub.coreinfra.ai/openai/api/v1",
    });
    expect(model.variants).toEqual([
      {
        id: "high",
        settings: { reasoningEffort: "high", reasoningSummary: "auto" },
      },
    ]);
  });

  it("does not copy a reasoning field onto non-chat routes", () => {
    const model = toV2Model(
      OPENAI_HUB,
      record([
        upstreamModel({ compatibility: { reasoningField: "reasoning" } }),
      ]),
    );
    expect(model.compatibility).toBeUndefined();
  });

  it("falls back to Hub name and defaults without an upstream record", () => {
    const model = toV2Model(OPENAI_HUB, undefined);

    expect(model.name).toBe("Hub GPT");
    expect(model.variants).toEqual([]);
    expect(model.cost).toEqual([]);
    expect(model.time).toEqual({ released: 0 });
    expect(model.limit).toEqual({ context: 200000, output: 64000 });
    expect(model.capabilities.tools).toBe(true);
  });
});

type Connection =
  | { type: "credential"; id: string }
  | { type: "env"; name: string }
  | undefined;

// A minimal stand-in for the OpenCode 2 plugin context: transforms are
// captured so tests can replay them, and the event stream is fed by hand.
function fakeContext(initial: Connection, keys: Record<string, string>) {
  let connection = initial;
  const integrationTransforms: ((editor: unknown) => void)[] = [];
  const providerTransforms: ((editor: unknown) => void)[] = [];
  const pending: ((value: IteratorResult<unknown>) => void)[] = [];
  const queued: unknown[] = [];
  let signal: AbortSignal | undefined;

  const ctx = {
    integration: {
      transform: vi.fn(async (cb: (editor: unknown) => void) => {
        integrationTransforms.push(cb);
        return { dispose: async () => {} };
      }),
      connection: {
        active: vi.fn(async () => connection),
        resolve: vi.fn(async (c: NonNullable<Connection>) => {
          const key = keys[c.type === "env" ? `env:${c.name}` : c.id];
          return key ? { type: "key", key } : undefined;
        }),
      },
    },
    provider: {
      transform: vi.fn(async (cb: (editor: unknown) => void) => {
        providerTransforms.push(cb);
        return { dispose: async () => {} };
      }),
      reload: vi.fn(async () => {}),
    },
    event: {
      subscribe: (options: { signal: AbortSignal }) => {
        signal = options.signal;
        return {
          [Symbol.asyncIterator]: () => ({
            next: () =>
              new Promise<IteratorResult<unknown>>((resolve) => {
                if (queued.length > 0)
                  return resolve({ value: queued.shift(), done: false });
                pending.push(resolve);
                options.signal.addEventListener("abort", () =>
                  resolve({ value: undefined, done: true }),
                );
              }),
          }),
        };
      },
    },
  };

  return {
    ctx: ctx as unknown as Parameters<typeof setup>[0],
    raw: ctx,
    setConnection(value: Connection) {
      connection = value;
    },
    emit(event: unknown) {
      const next = pending.shift();
      if (next) next({ value: event, done: false });
      else queued.push(event);
    },
    get signal() {
      return signal;
    },
    integrations() {
      const updates: unknown[] = [];
      const methods: unknown[] = [];
      const editor = {
        update: (id: string, fn: (i: { id: string; name: string }) => void) => {
          const integration = { id, name: id };
          fn(integration);
          updates.push(integration);
        },
        method: { update: (input: unknown) => methods.push(input) },
      };
      for (const cb of integrationTransforms) cb(editor);
      return { updates, methods };
    },
    providers(catalog: Record<string, ProviderRecord> = {}) {
      const added: {
        info: { id: string };
        models: Model.Info[];
        sourceConnection?: unknown;
      }[] = [];
      const editor = {
        get: (id: string) => catalog[id],
        add: (input: (typeof added)[number]) => added.push(input),
      };
      for (const cb of providerTransforms) cb(editor);
      return added;
    },
  };
}

function hubFetch(byKey: Record<string, "ok" | "fail">) {
  return vi.fn(
    async (_url: string, init?: { headers?: Record<string, string> }) => {
      const key = init?.headers?.["X-CoreInfra-Api-Key"] ?? "";
      if (byKey[key] !== "ok")
        return { ok: false, status: 401, statusText: "Unauthorized" };
      return { ok: true, json: async () => HUB };
    },
  );
}

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("setup", () => {
  it("is exposed next to the OpenCode 1 entrypoint", () => {
    expect(mod.id).toBe("coreinfra-opencode-plugin");
    expect(typeof mod.server).toBe("function");
    expect(mod.setup).toBe(setup);
  });

  // OpenCode 1.19 calls setup() from a preview V2 host that lacks the
  // provider and event domains, in addition to calling server().
  it("does nothing in the OpenCode 1 preview host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const integration = {
      transform: vi.fn(),
      reload: vi.fn(),
      connection: { active: vi.fn(), resolve: vi.fn() },
    };
    const ctx = {
      options: {},
      integration,
      catalog: { transform: vi.fn(), reload: vi.fn() },
    } as unknown as Parameters<typeof setup>[0];

    await expect(setup(ctx)).resolves.toBeUndefined();
    expect(integration.transform).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers login methods without a connection and adds no provider", async () => {
    const fetchMock = hubFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const fake = fakeContext(undefined, {});

    const cleanup = await setup(fake.ctx);

    expect(fake.integrations()).toEqual({
      updates: [{ id: "coreinfra", name: "CoreInfra AI Hub" }],
      methods: [
        {
          integrationID: "coreinfra",
          method: { type: "key", label: "CoreInfra API Key" },
        },
        {
          integrationID: "coreinfra",
          method: { type: "env", names: ["COREINFRA_API_KEY"] },
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.providers()).toEqual([]);
    cleanup?.();
  });

  it("adds the Hub inventory bound to the active connection", async () => {
    const fetchMock = hubFetch({ k1: "ok" });
    vi.stubGlobal("fetch", fetchMock);
    const connection = { type: "credential" as const, id: "cred_1" };
    const fake = fakeContext(connection, { cred_1: " k1 " });

    const cleanup = await setup(fake.ctx);

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "X-CoreInfra-Api-Key": "k1",
    });
    const [added] = fake.providers();
    expect(added?.info).toMatchObject({
      id: "coreinfra",
      integrationID: "coreinfra",
      activation: "auto",
      package: "",
    });
    expect(added?.sourceConnection).toBe(connection);
    expect(added?.models.map((m) => m.id)).toEqual([
      "gpt-5.4-nano",
      "claude-sonnet-4-5",
    ]);
    cleanup?.();
  });

  it("never reads the OpenCode 1 auth store", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const { readFile } = await import("node:fs/promises");
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "k1",
      },
    );

    const cleanup = await setup(fake.ctx);

    expect(readFile).not.toHaveBeenCalled();
    cleanup?.();
  });

  it("refetches and reloads after a credential switch", async () => {
    vi.stubGlobal("fetch", hubFetch({ k2: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "bad",
        cred_2: "k2",
      },
    );

    const cleanup = await setup(fake.ctx);
    expect(fake.providers()).toEqual([]);

    fake.setConnection({ type: "credential", id: "cred_2" });
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: "cred_2" },
    });
    await flush();

    expect(fake.raw.provider.reload).toHaveBeenCalledOnce();
    expect(fake.providers()[0]?.models).toHaveLength(2);
    cleanup?.();
  });

  it("ignores switches for other integrations", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "k1",
      },
    );

    const cleanup = await setup(fake.ctx);
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "openai", credentialID: "x" },
    });
    await flush();

    expect(fake.raw.provider.reload).not.toHaveBeenCalled();
    cleanup?.();
  });

  it("drops the previous account's inventory when the new one fails", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "k1",
        cred_2: "bad",
      },
    );

    const cleanup = await setup(fake.ctx);
    expect(fake.providers()).toHaveLength(1);

    fake.setConnection({ type: "credential", id: "cred_2" });
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: "cred_2" },
    });
    await flush();

    expect(fake.providers()).toEqual([]);
    cleanup?.();
  });

  it("keeps the last inventory when the same account fails to refresh", async () => {
    const fetchMock = hubFetch({ k1: "ok" });
    vi.stubGlobal("fetch", fetchMock);
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "k1",
      },
    );

    const cleanup = await setup(fake.ctx);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: "cred_1" },
    });
    await flush();

    expect(fake.providers()[0]?.models).toHaveLength(2);
    cleanup?.();
  });

  it("clears the inventory on logout", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      {
        cred_1: "k1",
      },
    );

    const cleanup = await setup(fake.ctx);
    fake.setConnection(undefined);
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: null },
    });
    await flush();

    expect(fake.providers()).toEqual([]);
    cleanup?.();
  });

  it("fetches the new account when it changes during the first fetch", async () => {
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      { cred_1: "k1", cred_2: "k2" },
    );
    const fetchMock = vi.fn(
      async (_url: string, init?: { headers?: Record<string, string> }) => {
        fake.setConnection({ type: "credential", id: "cred_2" });
        return {
          ok: true,
          json: async () => ({ ...HUB, key: init?.headers }),
        };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const cleanup = await setup(fake.ctx);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      "X-CoreInfra-Api-Key": "k2",
    });
    expect(fake.providers()[0]?.sourceConnection).toEqual({
      type: "credential",
      id: "cred_2",
    });
    cleanup?.();
  });

  it("uses an environment connection like a saved key", async () => {
    const fetchMock = hubFetch({ "env-key": "ok" });
    vi.stubGlobal("fetch", fetchMock);
    const connection = { type: "env" as const, name: "COREINFRA_API_KEY" };
    const fake = fakeContext(connection, {
      "env:COREINFRA_API_KEY": "env-key",
    });

    const cleanup = await setup(fake.ctx);

    expect(fake.providers()[0]?.sourceConnection).toBe(connection);
    cleanup?.();
  });

  it("does not publish or reload after cleanup during a refresh", async () => {
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      { cred_1: "k1" },
    );
    let release: () => void = () => {};
    const fetchMock = hubFetch({ k1: "ok" });
    vi.stubGlobal("fetch", fetchMock);
    const cleanup = await setup(fake.ctx);
    const before = fake.providers()[0]?.models;

    fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        ok: true,
        json: async () => ({ providers: { openai: HUB.providers.openai } }),
      };
    });
    fake.emit({
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: "cred_1" },
    });
    await flush();
    cleanup?.();
    release();
    await flush();

    expect(fake.raw.provider.reload).not.toHaveBeenCalled();
    expect(fake.providers()[0]?.models).toEqual(before);
  });

  it("keeps handling switches after a failed refresh and reload", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      { cred_1: "k1" },
    );
    const cleanup = await setup(fake.ctx);
    const switched = {
      type: "credential.switched",
      data: { integrationID: "coreinfra", credentialID: "cred_1" },
    };

    fake.raw.integration.connection.active.mockRejectedValueOnce(
      new Error("boom"),
    );
    fake.raw.provider.reload.mockRejectedValueOnce(new Error("boom"));
    fake.emit(switched);
    await flush();
    fake.emit(switched);
    await flush();

    expect(fake.raw.provider.reload).toHaveBeenCalledTimes(2);
    expect(fake.providers()[0]?.models).toHaveLength(2);
    cleanup?.();
  });

  it("reads upstream metadata afresh on every transform replay", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      { cred_1: "k1" },
    );
    const cleanup = await setup(fake.ctx);

    const first = fake.providers({
      openai: record([upstreamModel({ name: "Old name" })]),
    });
    const second = fake.providers({
      openai: record([upstreamModel({ name: "New name" })]),
    });

    expect(first[0]?.models[0]?.name).toBe("Old name");
    expect(second[0]?.models[0]?.name).toBe("New name");
    cleanup?.();
  });

  it("warns once per model missing from the OpenCode catalog", async () => {
    vi.stubGlobal("fetch", hubFetch({ k1: "ok" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeContext(
      { type: "credential", id: "cred_1" },
      { cred_1: "k1" },
    );
    const cleanup = await setup(fake.ctx);

    fake.providers({ openai: record([upstreamModel()]) });
    fake.providers({ openai: record([upstreamModel()]) });

    const missing = warn.mock.calls.filter((call) =>
      String(call[0]).includes("not found in the OpenCode catalog"),
    );
    expect(missing).toEqual([
      [
        "[plugin.coreinfra] anthropic/claude-sonnet-4-5 not found in the OpenCode catalog — using defaults",
      ],
    ]);
    cleanup?.();
  });

  it("stops the event subscription on cleanup", async () => {
    vi.stubGlobal("fetch", hubFetch({}));
    const fake = fakeContext(undefined, {});

    const cleanup = await setup(fake.ctx);
    expect(fake.signal?.aborted).toBe(false);
    cleanup?.();
    expect(fake.signal?.aborted).toBe(true);
  });
});
