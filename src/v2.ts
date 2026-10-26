import type { Model, Plugin, Provider } from "@opencode/plugin";
import type { ProviderRecord } from "@opencode/plugin/promise/provider";

import {
  fetchHubModels,
  type HubModel,
  listHubModels,
  PROVIDER_ID,
  PROVIDER_NAME,
} from "./models.ts";

type Context = Plugin.Context;
type Connection = NonNullable<
  Awaited<ReturnType<Context["integration"]["connection"]["active"]>>
>;
type Snapshot = {
  key: string;
  connection: Connection;
  models: HubModel[];
};

// Bounds how often one refresh chases an account that keeps changing; the
// switch events that caused it queue their own refreshes anyway.
const MAX_LOAD_ATTEMPTS = 3;
const DEFAULT_LIMIT = { context: 200000, output: 64000 };
const DEFAULT_CAPABILITIES = {
  tools: true,
  input: ["text", "image", "audio", "video", "pdf"],
  output: ["text"],
};

// Variants override model settings, so copied settings must preserve Hub
// routing and auth.
const VARIANT_SETTINGS = new Set([
  "reasoningEffort",
  "reasoningSummary",
  "include",
  "thinking",
  "effort",
]);

function log(message: string, error?: unknown) {
  console.warn(
    `[plugin.coreinfra] ${message}`,
    ...(error === undefined
      ? []
      : [error instanceof Error ? error.message : String(error)]),
  );
}

function connectionKey(connection: Connection | undefined) {
  if (!connection) return undefined;
  return connection.type === "env"
    ? `env:${connection.name}`
    : `credential:${connection.id}`;
}

function variants(upstream: Model.Info): Model.Variant[] {
  return upstream.variants.map((variant) => {
    const settings = Object.fromEntries(
      Object.entries(variant.settings ?? {})
        .filter(([key]) => VARIANT_SETTINGS.has(key))
        .map(([key, value]) => [key, structuredClone(value)]),
    );
    return {
      id: variant.id,
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
    };
  });
}

// Built-in chat models use vendor packages whose variants partly rely on
// settings our generic chat route ignores (e.g. thinking toggles). Keep only
// their effort levels, as plain reasoningEffort variants that the route sends.
function chatVariants(upstream: Model.Info): Model.Variant[] {
  return upstream.variants.flatMap((variant) => {
    const effort = variant.settings?.reasoningEffort;
    if (typeof effort !== "string" || effort === "none") return [];
    return [{ id: variant.id, settings: { reasoningEffort: effort } }];
  });
}

// Gemini's generateContent variants nest thinkingLevel in thinkingConfig;
// Interactions requires a top-level thinkingLevel.
function interactionsVariants(upstream: Model.Info): Model.Variant[] {
  return upstream.variants.flatMap((variant) => {
    const config = variant.settings?.thinkingConfig;
    const level =
      typeof config === "object" && config !== null && "thinkingLevel" in config
        ? config.thinkingLevel
        : undefined;
    if (typeof level !== "string") return [];
    return [{ id: variant.id, settings: { thinkingLevel: level } }];
  });
}

// Builds a model for the Hub inventory. Metadata comes from OpenCode's own
// models.dev record for the upstream provider (including inactive ones);
// identity, routing and auth always come from the Hub.
export function toV2Model(
  hub: HubModel,
  upstream: ProviderRecord | undefined,
): Model.Info {
  const source = upstream?.models.get(hub.id);
  const samePackage =
    source !== undefined &&
    (source.package ?? upstream?.provider.package) === hub.package;
  const chat = hub.package.endsWith("/openai-compatible");
  const interactions = hub.package.endsWith("/google/interactions");
  const reasoningField = chat
    ? source?.compatibility?.reasoningField
    : undefined;
  const id = hub.id as Model.ID;
  const capabilities = structuredClone(
    source?.capabilities ?? DEFAULT_CAPABILITIES,
  );

  return {
    id,
    modelID: id,
    providerID: PROVIDER_ID as Provider.ID,
    name: source?.name ?? hub.name,
    ...(source?.family ? { family: source.family } : {}),
    ...(reasoningField ? { compatibility: { reasoningField } } : {}),
    package: hub.package,
    settings: {
      baseURL: hub.api,
      // The chat protocol shapes requests (max_tokens, store, tool_stream)
      // by upstream provider name, as for OpenCode's built-in catalog.
      ...(chat ? { provider: hub.provider } : {}),
      // Gemini returns thought summaries only on request.
      ...(interactions ? { thinkingSummaries: "auto" } : {}),
    },
    headers: { ...hub.headers },
    capabilities: {
      ...capabilities,
      // The Hub rejects audio and video on Interactions. OpenCode replaces
      // unsupported attachments with a note.
      input: interactions
        ? capabilities.input.filter((m) => m !== "audio" && m !== "video")
        : capabilities.input,
    },
    variants:
      chat && source
        ? chatVariants(source)
        : interactions && source
          ? interactionsVariants(source)
          : samePackage
            ? variants(source)
            : [],
    time: { released: source?.time.released ?? 0 },
    cost: structuredClone(source?.cost ?? []),
    status: source?.status ?? "active",
    enabled: true,
    limit: structuredClone(source?.limit ?? DEFAULT_LIMIT),
  };
}

// OpenCode 2 implementation. The Hub inventory depends on the account, so it
// is fetched for the active connection, bound to it, and refetched whenever
// the active credential switches.
export async function setup(ctx: Context) {
  // OpenCode 1.x releases since 1.18 also call setup() from an early preview
  // of the V2 host whose context has no provider or event domains. Those hosts
  // run server() as well, so the OpenCode 1 implementation already covers them.
  if (!("provider" in ctx)) return;

  let snapshot: Snapshot | undefined;
  let queue = Promise.resolve();
  const warned = new Set<string>();
  const controller = new AbortController();
  const disposed = () => controller.signal.aborted;

  const active = () => ctx.integration.connection.active(PROVIDER_ID);

  // Fetches the inventory for the active connection. When the account changes
  // mid-fetch the result is dropped and the new account is fetched instead, so
  // a switch is never lost, even one that happened before we subscribed.
  async function load() {
    for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
      const connection = await active();
      const key = connectionKey(connection);
      if (disposed()) return;
      if (!connection || !key) {
        snapshot = undefined;
        return;
      }
      try {
        const credential = await ctx.integration.connection.resolve(connection);
        const apiKey =
          credential?.type === "key" ? credential.key.trim() : undefined;
        const models = listHubModels(await fetchHubModels(apiKey || undefined));
        const current = connectionKey(await active());
        if (disposed()) return;
        if (current !== key) continue;
        snapshot = { key, connection, models };
      } catch (err) {
        if (disposed()) return;
        // Keep the last good inventory only for the same account.
        if (snapshot?.key !== key) snapshot = undefined;
        log("fetchModels failed", err);
      }
      return;
    }
  }

  // Refreshes run one at a time so a slow fetch cannot overwrite a newer one,
  // and a failed refresh never blocks the ones queued after it.
  function refresh() {
    queue = queue.then(load).catch((err) => log("refresh failed", err));
    return queue;
  }

  // Login is registered before any network work so it stays available when
  // discovery fails.
  await ctx.integration.transform((editor) => {
    editor.update(PROVIDER_ID, (integration) => {
      integration.name = PROVIDER_NAME;
    });
    editor.method.update({
      integrationID: PROVIDER_ID,
      method: { type: "key", label: "CoreInfra API Key" },
    });
    editor.method.update({
      integrationID: PROVIDER_ID,
      method: { type: "env", names: ["COREINFRA_API_KEY"] },
    });
  });

  // Start listening before the first fetch. The host only subscribes once the
  // iterator is first pulled, so a switch can still land before that; load()
  // re-checks the active connection after fetching to cover it.
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        if (
          event.type !== "credential.switched" ||
          event.data.integrationID !== PROVIDER_ID
        )
          continue;
        await refresh();
        if (disposed()) return;
        await ctx.provider.reload().catch((err) => {
          log("provider reload failed", err);
        });
      }
    } catch (err) {
      if (!disposed()) log("event subscription failed", err);
    }
  })();

  await refresh();

  // Transforms are replayed whenever providers reload, so this only reads the
  // current snapshot and looks upstream records up afresh each time.
  await ctx.provider.transform((editor) => {
    if (!snapshot) return;
    editor.add({
      info: {
        id: PROVIDER_ID as Provider.ID,
        integrationID: PROVIDER_ID as NonNullable<
          Provider.Info["integrationID"]
        >,
        name: PROVIDER_NAME,
        activation: "auto",
        package: "",
      },
      models: snapshot.models.map((model) => {
        const upstream = editor.get(model.provider);
        const id = `${model.provider}/${model.id}`;
        if (!upstream?.models.has(model.id) && !warned.has(id)) {
          warned.add(id);
          log(`${id} not found in the OpenCode catalog — using defaults`);
        }
        return toV2Model(model, upstream);
      }),
      sourceConnection: snapshot.connection,
    });
  });

  return () => controller.abort();
}
