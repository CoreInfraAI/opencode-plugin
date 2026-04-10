import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchModels } from "../src/models.ts";

describe("fetchModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the hub response into opencode models", async () => {
    const json = vi.fn().mockResolvedValue({
      providers: {
        openai: {
          models: {
            "gpt-5.4-nano": {
              display_name: "GPT-5.4 Nano",
            },
          },
        },
        anthropic: {
          models: {
            "claude-sonnet-4-20250514": {
              display_name: "Claude Sonnet 4",
            },
          },
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json,
    });

    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchModels();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hub.coreinfra.ai/hub/api/prices",
    );

    expect(models["gpt-5.4-nano"]).toMatchObject({
      id: "gpt-5.4-nano",
      providerID: "coreinfra",
      api: {
        id: "gpt-5.4-nano",
        url: "https://hub.coreinfra.ai/codex/api/v1",
        npm: "@ai-sdk/openai",
      },
      name: "GPT-5.4 Nano",
      capabilities: {
        interleaved: true,
      },
      status: "active",
    });

    expect(models["claude-sonnet-4-20250514"]).toMatchObject({
      id: "claude-sonnet-4-20250514",
      providerID: "coreinfra",
      api: {
        id: "claude-sonnet-4-20250514",
        url: "https://hub.coreinfra.ai/claude/api/v1",
        npm: "@ai-sdk/anthropic",
      },
      name: "Claude Sonnet 4",
      capabilities: {
        interleaved: {
          field: "reasoning_content",
        },
      },
      headers: {
        "anthropic-beta":
          "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
      status: "active",
    });
  });
});
