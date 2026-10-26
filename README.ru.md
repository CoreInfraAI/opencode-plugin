# CoreInfra OpenCode Plugin

Плагин для [OpenCode](https://opencode.ai), который добавляет [CoreInfra AI Hub](https://hub.coreinfra.ai/) в качестве внешнего провайдера моделей.

## Установка

Работает с OpenCode 1.x (1.4.0 или новее) и OpenCode 2.x (2.0.28 или новее).

### OpenCode 2

Установка плагина
```bash
opencode plugin add '@coreinfra/opencode-plugin@latest'
```

Авторизация с вводом API-токена
```bash
opencode auth login coreinfra
```

### OpenCode 1

Установка плагина
```bash
opencode plugin -g '@coreinfra/opencode-plugin@latest'
```

Авторизация с вводом API-токена
```bash
opencode providers login --provider coreinfra
```

Во время авторизации потребуется API-токен [CoreInfra AI Hub](https://hub.coreinfra.ai/).

## Возможности

- **Актуальный список моделей** — каталог динамически загружается из API Hub при каждом запуске и всегда отражает его текущее состояние. Возможности моделей (контекст, reasoning, tool use и т.д.) определяются из каталога models.dev.
- **Все доступные модели** — поддерживается любая модель, предоставленная Hub.
- **Поддержка reasoning** — режим `interleaved thinking` включается автоматически там, где это применимо.

## Ограничения

На данный момент OpenCode поддерживает только цены в долларах.
Поэтому OpenCode показывает цены из API провайдера модели.

## Использование

После установки и авторизации модели будут доступны с префиксом `coreinfra/`:

```bash
opencode run -m coreinfra/gpt-5.4-nano
opencode run -m coreinfra/claude-sonnet-4-20250514
opencode run -m coreinfra/gemini-3.8-flash
opencode run -m coreinfra/grok-4.7
```

Посмотреть список всех доступных моделей:

```bash
opencode models coreinfra
```

## Поддерживаемые модели

Полный список моделей определяется содержимым Hub на момент запуска. Плагин поддерживает все модели, перечисленные на странице:
https://hub.coreinfra.ai/pricing

## Конфигурация

### Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `COREINFRA_API_KEY` | — | В OpenCode 2 — API-токен, используемый вместо авторизации (сохранённая авторизация имеет приоритет). В OpenCode 1 используется только для загрузки списка моделей; авторизация всё равно обязательна. |
| `COREINFRA_HUB_BASE_URL` | `https://hub.coreinfra.ai` | Базовый URL экземпляра CoreInfra Hub. Переопределяет стандартный эндпоинт для получения списка моделей и проксирования API. |

## Разработка
Форматирование кода:

```bash
just fmt
```

Полная проверка проекта:

```bash
just check
```
