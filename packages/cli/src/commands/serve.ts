/**
 * `anvil serve` — start a production MCP server directly from .anvil.yaml files.
 *
 * Uses the real @modelcontextprotocol/sdk. Works with Claude Desktop, Cursor,
 * Claude Code, and any MCP client. Zero codegen needed — YAML to running server.
 *
 * Usage in Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "my-tools": {
 *         "command": "npx",
 *         "args": ["@anvil-tools/cli", "serve", "./tools.anvil.yaml"]
 *       }
 *     }
 *   }
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import {
  parseAnvilYaml,
  mergeAnvilDefinitions,
  lowerToIR,
  toolParametersToJsonSchema,
  type AnvilIR,
  type AnvilIRTool,
} from '@anvil-tools/schema';
import type { Command } from 'commander';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start an MCP server from .anvil.yaml files (works with Claude Desktop, Cursor, Claude Code)')
    .argument('[patterns...]', 'Glob patterns for .anvil.yaml files', ['**/*.anvil.yaml'])
    .option('--stub', 'Return example data for all tools (great for testing)')
    .option('--handler <file>', 'JavaScript/TypeScript file exporting handler functions')
    .action(async (patterns: string[], opts: { stub?: boolean; handler?: string }) => {
      const files = (await Promise.all(
        patterns.map(p => glob(p, { ignore: 'node_modules/**' })),
      )).flat();

      if (files.length === 0) {
        console.error(chalk.yellow('No .anvil.yaml files found.'));
        console.error(chalk.dim('  Run `anvil init` to create a starter definition.'));
        process.exit(1);
      }

      // Parse all definition files
      const parseResults = await Promise.all(
        files.map(async file => {
          const filePath = resolve(file);
          const content = await readFile(filePath, 'utf-8');
          return parseAnvilYaml(content, { filePath });
        }),
      );

      const merged = mergeAnvilDefinitions(parseResults);
      const ir = lowerToIR(merged.service, files);

      // Load custom handlers if provided
      let customHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
      if (opts.handler) {
        try {
          const handlerPath = resolve(opts.handler);
          const mod = await import(handlerPath);
          customHandlers = mod.default ?? mod;
          console.error(chalk.dim(`  Loaded handlers from ${opts.handler}`));
        } catch (err) {
          console.error(chalk.yellow(`  Warning: could not load handlers from ${opts.handler}`));
          console.error(chalk.dim(`  ${err instanceof Error ? err.message : err}`));
        }
      }

      await startMcpServer(ir, !!opts.stub, customHandlers);
    });
}

async function startMcpServer(
  ir: AnvilIR,
  stub: boolean,
  handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
): Promise<void> {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const types = await import('@modelcontextprotocol/sdk/types.js');

  const server = new Server(
    { name: ir.service.name, version: ir.service.version },
    { capabilities: { tools: {} } },
  );

  // ─── tools/list ─────────────────────────────────────────────────────────

  server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
    tools: ir.tools.map(tool => {
      const inputSchema = toolParametersToJsonSchema(tool);

      // MCP annotations
      const annotations: Record<string, unknown> = {};
      if (tool.side_effects === 'none' || tool.side_effects === 'read') {
        annotations['readOnlyHint'] = true;
      }
      if (tool.side_effects === 'destructive') {
        annotations['destructiveHint'] = true;
      }
      if (tool.idempotent) {
        annotations['idempotentHint'] = true;
      }

      return {
        name: tool.name,
        description: tool.agent_description,
        inputSchema,
        annotations,
      };
    }),
  }));

  // ─── tools/call ─────────────────────────────────────────────────────────

  server.setRequestHandler(types.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = ir.tools.find(t => t.name === name);

    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // 1. Try custom handler first
    const camelName = name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    const handler = handlers[name] ?? handlers[camelName];

    if (handler) {
      try {
        const result = await handler((args ?? {}) as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error in ${name}: ${err instanceof Error ? err.message : err}` }],
          isError: true,
        };
      }
    }

    // 2. Stub mode — return example data
    if (stub && tool.examples.length > 0) {
      const example = tool.examples[0]!;
      const output = example.output ?? { tool: name, args, stub: true };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    }

    // 3. No handler, no stub — return helpful error
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: `Tool "${name}" has no handler implementation.`,
          hint: stub
            ? 'This tool has no examples to stub. Add examples to your .anvil.yaml.'
            : 'Use --stub to return example data, or --handler <file> to provide implementations.',
        }, null, 2),
      }],
      isError: true,
    };
  });

  // ─── Error handling ─────────────────────────────────────────────────────

  server.onerror = (error) => {
    console.error(chalk.red(`[anvil serve] Error: ${error.message}`));
  };

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  // ─── Start ──────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(chalk.cyan(`\n  anvil serve — ${ir.service.name} v${ir.service.version}`));
  console.error(chalk.dim(`  ${ir.tools.length} tools: ${ir.tools.map(t => t.name).join(', ')}`));
  if (stub) {
    console.error(chalk.dim('  Mode: stub (returning example data)'));
  }
  console.error(chalk.dim('  Transport: stdio'));
  console.error(chalk.dim('  Ready for MCP client connections.\n'));
}
