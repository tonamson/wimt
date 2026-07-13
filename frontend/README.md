# WIMT Token Audit

Local Next.js app that works as an AI proxy and token dashboard.

## Run

```bash
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:4393`.

## Point CLIs at the proxy

OpenAI-compatible tools, including Codex-style clients:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:4393/v1
export OPENAI_API_KEY=sk-...
```

Anthropic-compatible tools, including Claude-style clients:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:4393
export ANTHROPIC_API_KEY=sk-ant-...
```

The proxy endpoint is `/v1/*`. It forwards to the configured upstream and logs usage into SQLite.

## Configure upstream providers

Defaults:

```bash
export OPENAI_UPSTREAM_BASE_URL=https://api.openai.com
export ANTHROPIC_UPSTREAM_BASE_URL=https://api.anthropic.com
export DEFAULT_PROVIDER=auto
```

The dashboard also has inputs for changing OpenAI and Anthropic upstream base URLs at runtime. Use this for OpenAI-compatible or Anthropic-compatible third-party providers.

## Data

SQLite file defaults to:

```bash
frontend/data/wimt.sqlite
```

Override it with:

```bash
export WIMT_DB_PATH=/absolute/path/to/wimt.sqlite
```

## Checks

```bash
npm test
npm run lint
npm run build
```
