import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fetchModels } from "./models.js";
const PROVIDER_NAME = "CoreInfra AI Hub";
const LEGACY_PROVIDER_NAMES = new Set(["coreinfra", "CoreInfra Hub"]);
const OPENCODE_MODELS_CACHE_PATH = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opencode", "models.json");
function resolveProviderName(currentName) {
    return !currentName || LEGACY_PROVIDER_NAMES.has(currentName) ? PROVIDER_NAME : currentName;
}
async function ensureOpencodeProviderMetadata() {
    let raw;
    try {
        raw = await readFile(OPENCODE_MODELS_CACHE_PATH, "utf8");
    }
    catch {
        return;
    }
    let cache;
    try {
        cache = JSON.parse(raw);
    }
    catch {
        return;
    }
    const current = cache.coreinfra;
    const name = resolveProviderName(current?.name);
    if (current?.id === "coreinfra" &&
        current?.name === name &&
        Array.isArray(current.env) &&
        current.models &&
        typeof current.models === "object") {
        return;
    }
    cache.coreinfra = {
        ...(current ?? {}),
        id: "coreinfra",
        name,
        env: current?.env ?? [],
        models: current?.models ?? {},
    };
    await mkdir(dirname(OPENCODE_MODELS_CACHE_PATH), { recursive: true });
    await writeFile(OPENCODE_MODELS_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}
function ensureCoreInfraProvider(config) {
    config.provider ??= {};
    const currentName = config.provider.coreinfra?.name;
    config.provider.coreinfra = {
        ...(config.provider.coreinfra ?? {}),
        name: resolveProviderName(currentName),
    };
}
async function plugin(_input) {
    await ensureOpencodeProviderMetadata();
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
                if (!auth || auth.type !== "api")
                    return {};
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
//# sourceMappingURL=index.js.map