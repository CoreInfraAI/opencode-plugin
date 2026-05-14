import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";

import {
  buildConfigModels,
  fetchModelsDevData,
  fetchHubModels,
} from "./models.ts";

const PROVIDER_NAME = "CoreInfra AI Hub";

function ensureCoreInfraProvider(config: Config) {
  config.provider ??= {};
  config.provider.coreinfra = {
    ...(config.provider.coreinfra ?? {}),
    name: PROVIDER_NAME,
  };
}

async function log(
  input: PluginInput,
  message: string,
  extra?: Record<string, unknown>,
  level: "debug" | "warn" | "error" = "debug",
) {
  await input.client.app
    .log({
      body: {
        service: "plugin.coreinfra",
        level,
        message,
        extra,
      },
    })
    .catch(() => {});
}

async function plugin(input: PluginInput): Promise<Hooks> {
  const t0 = performance.now();
  await log(input, "plugin load started");
  await log(input, "plugin hooks registered", {
    duration: `${Math.round(performance.now() - t0)}ms`,
  });

  return {
    config: async (config) => {
      const t = performance.now();
      ensureCoreInfraProvider(config);
      try {
        const [modelsDevData, hubData] = await Promise.all([
          fetchModelsDevData(),
          fetchHubModels(),
        ]);
        const { models: configModels, warnings } = buildConfigModels(
          modelsDevData,
          hubData,
        );
        for (const w of warnings) {
          await log(input, w);
        }
        if (!config.provider) config.provider = {};
        if (!config.provider.coreinfra) config.provider.coreinfra = {};
        config.provider.coreinfra.models =
          configModels as typeof config.provider.coreinfra.models;
      } catch (err) {
        await log(
          input,
          "fetchModels failed",
          {
            error: err instanceof Error ? err.message : String(err),
          },
          "error",
        );
      }
      await log(input, "config hook completed", {
        duration: `${Math.round(performance.now() - t)}ms`,
      });
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
        if (!auth || auth.type !== "api") {
          await log(input, "auth loader completed (no auth)", {
            duration: `${Math.round(performance.now() - t)}ms`,
          });
          return {};
        }
        await log(input, "auth loader completed", {
          duration: `${Math.round(performance.now() - t)}ms`,
        });
        return { apiKey: auth.key };
      },
    },
  };
}

export default {
  id: "coreinfra-opencode-plugin",
  server: plugin,
};
