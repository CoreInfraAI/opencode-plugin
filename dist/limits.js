const OPENAI_LIMITS = {
    "gpt-5": { context: 400000, output: 128000 },
    "gpt-5-nano": { context: 400000, output: 128000 },
    "gpt-5-codex": { context: 400000, output: 128000 },
    "gpt-5.1": { context: 400000, output: 128000 },
    "gpt-5.1-codex": { context: 400000, output: 128000 },
    "gpt-5.1-codex-mini": { context: 400000, output: 128000 },
    "gpt-5.1-codex-max": { context: 400000, output: 128000 },
    "gpt-5.2": { context: 400000, output: 128000 },
    "gpt-5.2-codex": { context: 400000, output: 128000 },
    "gpt-5.2-pro": { context: 400000, output: 128000 },
    "gpt-5.3-codex": { context: 400000, output: 128000 },
    "gpt-5.4-mini": { context: 400000, output: 128000 },
    "gpt-5.4-nano": { context: 400000, output: 128000 },
    "gpt-5-pro": { context: 400000, output: 272000 },
    "gpt-5.4": { context: 1050000, output: 128000 },
    "gpt-5.4-pro": { context: 1050000, output: 128000 },
};
const ANTHROPIC_LIMITS = {
    "claude-3-haiku-20240307": { context: 200000, output: 4096 },
    "claude-opus-4-20250514": { context: 200000, output: 32000 },
    "claude-opus-4-1-20250805": { context: 200000, output: 32000 },
    "claude-haiku-4-5-20251001": { context: 200000, output: 64000 },
    "claude-sonnet-4-20250514": { context: 200000, output: 64000 },
    "claude-sonnet-4-5-20250929": { context: 200000, output: 64000 },
    "claude-opus-4-5-20251101": { context: 200000, output: 64000 },
    "claude-sonnet-4-6": { context: 1000000, output: 64000 },
    "claude-opus-4-6": { context: 1000000, output: 128000 },
};
const DEFAULT_LIMITS = { context: 200000, output: 64000 };
export function getLimits(modelId) {
    return OPENAI_LIMITS[modelId] ?? ANTHROPIC_LIMITS[modelId] ?? DEFAULT_LIMITS;
}
//# sourceMappingURL=limits.js.map