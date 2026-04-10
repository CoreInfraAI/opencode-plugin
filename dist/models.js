import { getLimits } from "./limits.js";
const HUB_URL = "https://hub.coreinfra.ai/hub/api/prices";
const OPENAI_BASE = "https://hub.coreinfra.ai/codex/api/v1";
const ANTHROPIC_BASE = "https://hub.coreinfra.ai/claude/api/v1";
const ANTHROPIC_BETA_HEADER = "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";
function isAnthropic(provider) {
    return provider === "anthropic";
}
function buildModel(modelId, provider, displayName, prices) {
    const anthropic = isAnthropic(provider);
    const limits = getLimits(modelId);
    return {
        id: modelId,
        providerID: "coreinfra",
        api: {
            id: modelId,
            url: anthropic ? ANTHROPIC_BASE : OPENAI_BASE,
            npm: anthropic ? "@ai-sdk/anthropic" : "@ai-sdk/openai",
        },
        name: displayName,
        capabilities: {
            temperature: true,
            reasoning: true,
            attachment: true,
            toolcall: true,
            input: { text: true, audio: true, image: true, video: true, pdf: true },
            output: { text: true, audio: false, image: false, video: false, pdf: false },
            interleaved: anthropic
                ? { field: "reasoning_content" }
                : true,
        },
        cost: {
            input: prices.input_tokens,
            output: prices.output_tokens,
            cache: {
                read: prices.cache_read_tokens ?? 0,
                write: prices.cache_5m_write_tokens ?? 0,
            },
        },
        limit: {
            context: limits.context,
            output: limits.output,
        },
        status: "active",
        options: {},
        headers: anthropic
            ? { "anthropic-beta": ANTHROPIC_BETA_HEADER }
            : {},
        release_date: "",
    };
}
export async function fetchModels() {
    const res = await fetch(HUB_URL);
    if (!res.ok) {
        throw new Error(`Failed to fetch CoreInfra prices: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const models = {};
    for (const [provider, providerData] of Object.entries(data.providers)) {
        for (const [modelId, modelData] of Object.entries(providerData.models)) {
            models[modelId] = buildModel(modelId, provider, modelData.display_name, modelData.prices);
        }
    }
    return models;
}
//# sourceMappingURL=models.js.map