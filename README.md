# CoreInfra OpenCode Plugin

Plugin for [OpenCode](https://opencode.ai) that adds [CoreInfra AI Hub](https://hub.coreinfra.ai/) as an external model provider.

## Installation

**Important:** requires OpenCode version 1.4.0 or newer

```bash
# Install the plugin
opencode plugin -g 'coreinfra-opencode-plugin@github:CoreInfraAI/opencode-plugin'
# Log in by entering the API token
opencode providers login --provider coreinfra
```

During authentication, you will need a [CoreInfra AI Hub](https://hub.coreinfra.ai/) API token.

## Features

- **Up-to-date model list** - the catalog is loaded dynamically from the Hub API on every startup and always reflects its current state.
- **OpenAI and Anthropic models** - both model families are supported, including GPT-5.x and Claude 4.x.
- **Reasoning support** - `interleaved thinking` mode is enabled automatically for Anthropic models.

## Limitations

At the moment, OpenCode supports prices in USD only.
Because of that, pricing is not overridden yet: OpenCode shows prices from the original OpenAI/Anthropic API.

## Usage

After installation and authentication, models will be available with the `coreinfra/` prefix:

```bash
opencode run -m coreinfra/gpt-5.4-nano
opencode run -m coreinfra/claude-sonnet-4-20250514
```

To see the full list of available models:

```bash
opencode models coreinfra
```

## Supported Models

The full model list is determined by the Hub contents at startup time. The plugin supports all models listed on this page:
https://hub.coreinfra.ai/pricing

## Development

Code formatting:

```bash
just fmt
```

Full project check:

```bash
just check
```
