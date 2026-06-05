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

The tutor works offline with deterministic local answers. To use OpenAI, set:

```bash
set OPENAI_API_KEY=your_key_here
```

Optional:

```bash
set OPENAI_MODEL=gpt-4.1-mini
```

## Data

- Local dataset: `data/site-data.json`
- SQLite database: `data/avtolearn.sqlite`
- Local media: `public/assets/media`
- Local static assets: `public/assets/static`

The runtime app does not depend on `eavtotalim.uz`.
