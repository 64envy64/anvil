---
title: Hub Deployment Guide
description: Deploy your own Anvil tool registry — SQLite-backed, rate-limited, zero external services.
date: "2025-04-01"
---

## Overview

The Anvil Hub is a self-hosted tool registry. Developers publish tool definitions with `anvil publish`, others discover and install them with `anvil search` and `anvil install`. The Hub stores everything in SQLite — no Postgres, no Redis, no external services.

## Quick Start (local)

```bash
cd packages/hub
npm install
SEED=true npm run dev
```

This starts the hub on `http://localhost:4400` and seeds it with the example tool packages.

## Production Deployment

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4400 | HTTP port |
| `DATA_DIR` | ./data | SQLite database directory |
| `ADMIN_TOKEN` | anvil-admin-dev | Admin bearer token (**change this!**) |
| `SEED` | false | Set to "true" to seed example packages |

### Fly.io (recommended)

```bash
cd packages/hub
fly launch --name anvil-hub
fly secrets set ADMIN_TOKEN=your-secret-token-here
fly deploy
```

### Railway

```bash
# Connect your repo, set the root to packages/hub
# Set env vars: ADMIN_TOKEN, DATA_DIR=/data
# Railway auto-detects the Dockerfile
```

### Docker

```bash
docker build -t anvil-hub packages/hub
docker run -d \
  -p 4400:4400 \
  -v anvil-data:/data \
  -e ADMIN_TOKEN=your-secret-token \
  -e SEED=true \
  anvil-hub
```

### Any VPS

```bash
cd packages/hub
npm install
npm run build
PORT=4400 ADMIN_TOKEN=your-secret-token SEED=true node dist/server.js
```

Put behind Caddy or nginx for HTTPS:

```
# Caddyfile
your-hub-domain.com {
    reverse_proxy localhost:4400
}
```

## API Reference

### Publish a Package

```bash
curl -X POST http://localhost:4400/api/v1/packages \
  -H "Authorization: Bearer avt_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "definition": "anvil: \"1.0\"\nservice:\n  name: my-tools\n  ...",
    "readme": "# My Tools\n...",
    "tags": ["api", "weather"]
  }'
```

The hub **validates the YAML** on publish:
- Must have `anvil:` version field
- Must have `service.name` (lowercase, kebab/snake)
- Must have `service.version` (semver)
- Must have at least one tool
- Version must be newer than any previously published version

### Search Packages

```bash
# Full-text search (name, description, agent descriptions, when_to_use)
curl "http://localhost:4400/api/v1/search?q=weather"

# Filter by tags
curl "http://localhost:4400/api/v1/search?tags=database,sql"

# Sort options: downloads, updated, created, name, featured
curl "http://localhost:4400/api/v1/search?sort=featured"
```

### Get a Package

```bash
curl http://localhost:4400/api/v1/packages/weather-tools
```

### Download Definition (YAML)

```bash
# Latest version
curl http://localhost:4400/api/v1/packages/weather-tools/definition

# Specific version
curl http://localhost:4400/api/v1/packages/weather-tools/versions/1.0.0/definition
```

### Featured/Trending

```bash
curl http://localhost:4400/api/v1/featured
```

### Create User Tokens

```bash
# Admin only — creates a publish token
curl -X POST http://localhost:4400/api/v1/tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"owner": "alice", "scopes": "publish"}'
```

## Security Best Practices

1. **Change the ADMIN_TOKEN** from the default before deploying
2. **Use HTTPS** in production (Caddy, nginx, or cloud provider TLS)
3. Tokens are stored as SHA-256 hashes — the plain text is never saved
4. **Rate limiting** is built-in: 120 reads/min, 20 writes/min per IP
5. **Body size limit**: 2MB max request body
6. Use scoped tokens: `publish` scope for regular users, `admin` for management

## Backups

SQLite stores everything in `DATA_DIR/hub.db`. To back up:

```bash
# While running (WAL mode allows concurrent reads)
sqlite3 /data/hub.db ".backup /backups/hub-$(date +%Y%m%d).db"
```

Or simply copy the file when the server is stopped.

## CLI Integration

```bash
# Save token locally
anvil login --token avt_your_token --registry http://localhost:4400/api/v1

# Publish (reads saved token)
anvil publish tools.anvil.yaml

# Search
anvil search "weather"

# Install a package
anvil install weather-tools
```
