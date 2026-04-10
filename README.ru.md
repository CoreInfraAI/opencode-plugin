# CoreInfra OpenCode Plugin

Плагин для [OpenCode](https://opencode.ai), который добавляет [CoreInfra AI Hub](https://hub.coreinfra.ai/) в качестве внешнего провайдера моделей.

## Установка

**Важно:** требуется версия OpenCode не старше 1.4.0

```bash
# Установка плагина
opencode plugin -g 'coreinfra-opencode-plugin@github:CoreInfraAI/opencode-plugin'
# Авторизация с вводом API-токена
opencode providers login --provider coreinfra
```

Во время авторизации потребуется API-токен [CoreInfra AI Hub](https://hub.coreinfra.ai/).

## Возможности

- **Актуальный список моделей** — каталог динамически загружается из API Hub при каждом запуске и всегда отражает его текущее состояние.
- **Модели OpenAI и Anthropic** — поддерживаются обе линейки, включая GPT-5.x и Claude 4.x.
- **Поддержка reasoning** — для моделей Anthropic автоматически включается режим `interleaved thinking`.

## Ограничения

На данный момент OpenCode поддерживает только цены в долларах.
Поэтому стоимость пока не переопределяется: OpenCode показывает цены из исходного API OpenAI/Anthropic.

## Использование

После установки и авторизации модели будут доступны с префиксом `coreinfra/`:

```bash
opencode run -m coreinfra/gpt-5.4-nano
opencode run -m coreinfra/claude-sonnet-4-20250514
```

Посмотреть список всех доступных моделей:

```bash
opencode models coreinfra
```

## Поддерживаемые модели

Полный список моделей определяется содержимым Hub на момент запуска. Плагин поддерживает все модели, перечисленные на странице:
https://hub.coreinfra.ai/pricing

## Разработка
Форматирование кода:

```bash
just fmt
```

Полная проверка проекта:

```bash
just check
```
