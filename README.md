# Avtolearn AI Studio

Modern local-first driving education dashboard inspired by Eavtota'lim.

## Run

```bash
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:5180
```

## Development

```bash
npm run dev
```

Client runs on `http://127.0.0.1:5177` and proxies `/api` to the local server.

## AI Tutor

The tutor works offline with deterministic local answers. To use OpenRouter, set:

```bash
set OPENROUTER_API_KEY=your_key_here
```

Optional:

```bash
set OPENROUTER_MODEL=openai/gpt-oss-120b:free
set OPENROUTER_FALLBACK_MODEL=nvidia/nemotron-3-super-120b-a12b:free
set OPENROUTER_SITE_URL=http://127.0.0.1:5177
set OPENROUTER_APP_NAME=AvtoLearn AI Studio
set AI_TUTOR_RATE_WINDOW_MS=60000
set AI_TUTOR_RATE_MAX=12
set AI_TUTOR_DAILY_MAX=200
set AI_TUTOR_PROVIDER_TIMEOUT_MS=25000
set AI_TUTOR_MAX_MESSAGE_CHARS=2500
set AI_HISTORY_RETENTION_DAYS=90
```

OpenAI is still supported as a secondary provider if OpenRouter is not configured:

```bash
set OPENAI_API_KEY=your_key_here
set OPENAI_MODEL=gpt-4.1-mini
```

For production, always set a long random `SESSION_SECRET`; the server refuses to start with `NODE_ENV=production` if it is missing.

## Data

- Local dataset: `data/site-data.json`
- SQLite database: `data/avtolearn.sqlite`
- Local media: `public/assets/media`
- Local static assets: `public/assets/static`

The runtime app does not depend on `eavtotalim.uz`.
