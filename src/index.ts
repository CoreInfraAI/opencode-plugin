import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";

import { fetchModels } from "./models.ts";

const PROVIDER_NAME = "CoreInfra AI Hub";
const LEGACY_PROVIDER_NAMES = new Set(["coreinfra", "CoreInfra Hub"]);

function resolveProviderName(currentName?: string) {
  return !currentName || LEGACY_PROVIDER_NAMES.has(currentName)
    ? PROVIDER_NAME
    : currentName;
}

function ensureCoreInfraProvider(config: Config) {
  config.provider ??= {};
  const currentName = config.provider.coreinfra?.name;
  config.provider.coreinfra = {
    ...(config.provider.coreinfra ?? {}),
    name: resolveProviderName(currentName),
  };
}

async function log(input: PluginInput, message: string, extra?: Record<string, unknown>) {
  await input.client.app.log({
    body: {
      service: "plugin.coreinfra",
      level: "debug",
      message,
      extra,
    },
  });
}

async function plugin(input: PluginInput): Promise<Hooks> {
  const t0 = performance.now();
  await log(input, "plugin load started");
  await log(input, "plugin hooks registered", { duration: `${Math.round(performance.now() - t0)}ms` });

  return {
    config: async (config) => {
      const t = performance.now();
      ensureCoreInfraProvider(config);
      await log(input, "config hook completed", { duration: `${Math.round(performance.now() - t)}ms` });
    },
    auth: {
      provider: "coreinfra",
      methods: [
        {
          type: "api",
          label: "CoreInfra API Key",
        },
      ],
      loader: async (getAuth) => {
        const t = performance.now();
        const auth = await getAuth();
        if (!auth || auth.type !== "api") return {};
        await log(input, "auth loader completed", { duration: `${Math.round(performance.now() - t)}ms` });
        return { apiKey: auth.key };
      },
    },
    provider: {
      id: "coreinfra",
      models: async () => {
        const t = performance.now();
        const models = await fetchModels();
        await log(input, "models fetch completed", {
          duration: `${Math.round(performance.now() - t)}ms`,
          count: Object.keys(models).length,
        });
        return models;
      },
    },
  };
}

export default {
  id: "coreinfra-opencode-plugin",
  server: plugin,
};
