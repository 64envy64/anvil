---
title: CLI Reference
description: Complete reference for all Anvil CLI commands — init, validate, compile, dev, serve, publish, search, doctor.
date: "2025-03-31"
---

## anvil init

Scaffold a new Anvil tool project.

```bash
anvil init [directory] [--name <name>]
```

Creates `tools.anvil.yaml` and `anvil.config.ts` in the target directory.

## anvil validate

Validate tool definition files.

```bash
anvil validate [patterns...] [--strict]
```

- Default pattern: `**/*.anvil.yaml`
- `--strict` treats warnings as errors

## anvil compile

Compile tool definitions to target outputs.

```bash
anvil compile [options]

Options:
  -c, --config <path>   Config file (default: anvil.config.ts)
  -o, --out-dir <dir>   Output directory
  --target <name>       Only compile a specific target
  --dry-run             Show what would be generated
```

## anvil dev

Watch mode — recompile on file changes.

```bash
anvil dev [-c config] [-o out-dir]
```

## anvil serve

Start a local MCP server for testing.

```bash
anvil serve [patterns...] [options]

Options:
  -p, --port <port>   Use HTTP transport on this port
  --stub              Return example data for unimplemented tools
```

## anvil publish

Publish tool definitions to the registry.

```bash
anvil publish [file] [options]

Options:
  --registry <url>   Registry URL (default: localhost:4400)
  --token <token>    Auth token (or set ANVIL_TOKEN)
  --tag <tags...>    Tags for discovery
  --dry-run          Validate without publishing
  --local            Publish to local registry
```

## anvil search

Search the registry for tool definitions.

```bash
anvil search <query> [--tag <tags...>] [--local]
```

## anvil doctor

Check your project for common issues and get recommendations.

```bash
anvil doctor
```

Checks:
- Node.js version compatibility
- Missing or invalid anvil.config.ts
- Tool definition validation
- Missing agent descriptions
- Missing examples for eval
- Permission declarations
- Deprecated field usage
