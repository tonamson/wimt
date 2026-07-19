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

The public proxy endpoint is `/v1/*`. Claude's `/v1/messages` goes through
Headroom before WIMT forwards it upstream and logs usage into SQLite. Other
routes go directly to WIMT.

## Configure

All env vars are documented in the repo-root [`.env.example`](../.env.example).

```bash
# From repo root
cp .env.example .env
# edit .env, then either export vars or run under Docker Compose
```

Useful keys:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_UPSTREAM_BASE_URL` | `https://api.openai.com` | Upstream OpenAI-compatible API |
| `ANTHROPIC_UPSTREAM_BASE_URL` | `https://api.anthropic.com` | Upstream Anthropic-compatible API |
| `DEFAULT_PROVIDER` | `auto` | `auto` \| `openai` \| `anthropic` |
| `WIMT_DB_PATH` | `frontend/data/wimt.sqlite` | SQLite path (local dev) |
| `WIMT_RETENTION_DAYS` | `14` | Auto-delete request logs older than N days |
| `WIMT_LOG_BODIES` | `1` | `0` = usage only, no request/response bodies |
| `WIMT_LOG_BODY_MAX` | `8000` | Max chars per body snapshot |
| `PROXY_PUBLIC_BASE_URL` | `http://127.0.0.1:4393` | CLI entry shown in dashboard (WIMT) |
| `WIMT_DEBUG_USAGE` | off | Set `1` to log normalized usage |

The dashboard can also change OpenAI/Anthropic upstream URLs at runtime.

### Sessions

- **Measurement session** (`ses_…`): set by WIMT (`POST /api/session` starts a
  new window without clearing history). Dashboard “current session” totals use this.
- **CLI session**: UUID extracted from Claude/Codex request metadata when present;
  shown in the request log for conversation grouping.

## Docker

Only port `4393` binds to **127.0.0.1** (not LAN). Caddy routes Claude's
`/v1/messages` through the internal Headroom service; WIMT and Headroom are not
published directly. Config comes from `.env`:

```bash
# repo root
cp .env.example .env
docker compose up --build
```

## Checks

```bash
npm test
npm run lint
npm run build
```
