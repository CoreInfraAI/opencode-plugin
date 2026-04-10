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

async function plugin(_input: PluginInput): Promise<Hooks> {
  return {
    config: async (config) => {
      ensureCoreInfraProvider(config);
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
        const auth = await getAuth();
        if (!auth || auth.type !== "api") return {};
        return { apiKey: auth.key };
      },
    },
    provider: {
      id: "coreinfra",
      models: async () => {
        return await fetchModels();
      },
    },
  };
}

export default {
  id: "coreinfra-opencode-plugin",
  server: plugin,
};
