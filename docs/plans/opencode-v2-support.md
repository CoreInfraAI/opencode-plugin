# OpenCode 2 support (dual 1.x / 2.x plugin)

Status: implemented and verified (packed package on OpenCode 1.4.0, 1.19.0, 2.0.28); reviewed by Codex. Target release: **1.3.0** (no breaking change for V1).

## Feature

One npm package that works on **OpenCode 1.x (≥ 1.4.0)** and **OpenCode 2.x**:

- On V1, the plugin behaves exactly as it does today.
- On V2, it registers the `coreinfra` login (API key or `COREINFRA_API_KEY`) and the `coreinfra` provider with every model the Hub lists. Each model gets its correct protocol and endpoint and keeps its thinking/effort variants.
- After login, logout or an account switch, the model list refreshes without restarting OpenCode.

## Why the V1 plugin can't just run on V2

| Area | V1 (today) | V2 |
|---|---|---|
| Entry | `default { id, server() → hooks }` | `default { id, setup(ctx) }`. V1 plugins don't load. |
| Models | `config` hook edits `config.provider.coreinfra.models` | `ctx.provider.transform(editor => editor.add(...))`. Must be sync and replayable. |
| Login | `auth` hook + `loader → { apiKey }` | `ctx.integration.transform` registers `key` and `env` methods. Core adds `apiKey` itself. |
| Key storage | `auth.json` | Database. `auth.json` is imported once, so new logins never reach it. |
| Model shape | `provider{npm,api}`, `tool_call`, `modalities`, `cost{cache_read}`, `interleaved` | `package`, `settings.baseURL`, `capabilities`, `cost[{cache{read,write}}]`, `compatibility`, `variants[]`, `time`, `status`, `enabled` |
| Logging | `client.app.log` | none; use `console` |
| CLI | `opencode plugin -g`, `opencode providers login` | `opencode plugin add`, `opencode auth login coreinfra` |

Compatibility is checked in the source: the V2 loader ignores the extra `server` key (`core/src/plugin/module.ts:78`). The V1 1.4.0 loader ignores the extra `setup` key (`readV1Plugin`).

## Plan

1. **Entry:** `export default { id, server: v1, setup: v2 }`. Import V2 types only (`import type`), because `@opencode/plugin` doesn't exist at runtime under V1.
2. **`src/models.ts` (shared):** Hub fetch takes an explicit `apiKey` and has no `auth.json` fallback. Also holds `PROVIDERS` (protocol → base URL, headers), lookups and helpers.
3. **`src/v1.ts`:** today's `config`/`auth` hooks moved here unchanged, including the `auth.json`/env key lookup.
4. **`src/v2.ts` `setup(ctx)`:**
   - Integration `coreinfra` ("CoreInfra AI Hub"), with methods `{type:"key"}` and `{type:"env", names:["COREINFRA_API_KEY"]}`. Always registered, even if discovery fails.
   - Key comes from `integration.connection.active("coreinfra")` → `resolve()` only. V2 ranks a saved key above env.
   - `refresh()` fetches the Hub list and stores a snapshot bound to the connection. Refreshes are serialized, results for a stale connection are dropped, and the last good data is kept only for the same connection.
   - `provider.transform` (sync) does `editor.add({ info: { id:"coreinfra", integrationID:"coreinfra", activation:"auto", package:"" }, models, sourceConnection })`.
   - `event.subscribe` reacts to `credential.switched` for `coreinfra` by calling `refresh()` and then `ctx.provider.reload()`. Cleanup aborts it.
5. **V2 model mapping:** the Hub list decides which models exist. For each Hub model, look up the built-in upstream record (`openai`/`anthropic`/`deepseek`/…) inside each transform replay, never cached in `setup`.
   - Package: `@opencode/ai/providers/{openai|anthropic|openai-compatible}`, explicit native packages, not `aisdk:`.
   - Copy only allowlisted fields from upstream: capabilities, limit, cost, family, time, status. Replace ids, providerID, package, `settings.baseURL`, headers and `enabled`.
   - Variants: deep-clone only the reviewed thinking/effort fields, and only when `upstream.package ?? record.provider.package` equals our package. Otherwise use `variants: []`. This is an accepted limitation for DeepSeek, ZAI and Moonshot.
   - `compatibility.reasoningField` comes from the upstream model on chat routes only. No synthetic `reasoning_content` for Anthropic.
   - If the upstream record is missing, fall back to the Hub name plus defaults and log a warning. V2 no longer fetches models.dev itself.
6. **Packaging:** devDependencies `@opencode-ai/plugin`, `@opencode-ai/sdk`, `@opencode/plugin`. All host peers marked optional.
7. **Docs:** README install and login steps for both majors; note that a saved key takes priority over env on V2.

## Tests

- Unit: V1 behaviour unchanged. V2 mapper covers inherited package, matching and mismatched package, missing record and variant field isolation.
- V2 lifecycle with a fake `ctx`:
  - discovery fails at first, then login succeeds
  - env only, and env + saved key together
  - switch account and logout
  - a stale refresh finishes late
  - transform replay after a catalog reload
  - cleanup
  - `auth.json` is never read
- Manual release gate: install the **packed** package (no devDependencies) on OpenCode 1.4.0, 1.19.0 and 2.0.28. Log in, list models, then do a reasoning + tool-call round trip on the openai, anthropic and deepseek routes.

## Out of scope / known limits

- Thinking variants for models whose upstream uses a different package (DeepSeek/ZAI/Moonshot).
- A key changed without a switch event doesn't refresh until restart.
- Hub prices: OpenCode still supports USD only.
- Hub models that models.dev marks deprecated are missing from OpenCode 2's built-in catalog, so on V2 they get default metadata (and a warning).
- 2.x support is verified on 2.0.28. Older 2.x releases are unverified.
