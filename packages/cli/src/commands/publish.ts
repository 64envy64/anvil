/**
 * `anvil publish` — publish a tool definition to the registry.
 * `anvil search`  — search for published tool definitions.
 */

import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { parseAnvilYaml } from '@anvil-tools/schema';
import type { Command } from 'commander';

async function loadSavedConfig(): Promise<{ registry?: string; token?: string }> {
  try {
    return JSON.parse(await readFile(join(homedir(), '.anvil', 'config.json'), 'utf-8'));
  } catch { return {}; }
}

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Publish tool definitions to the Anvil registry')
    .argument('[file]', 'Path to .anvil.yaml file', 'tools.anvil.yaml')
    .option('--registry <url>', 'Registry URL', 'http://localhost:4400/api/v1')
    .option('--token <token>', 'Auth token (or set ANVIL_TOKEN)')
    .option('--tag <tags...>', 'Tags for discovery')
    .option('--dry-run', 'Validate without publishing')
    .option('--local', 'Publish to local registry (~/.anvil/registry)')
    .action(async (file: string, opts: {
      registry: string;
      token?: string;
      tag?: string[];
      dryRun?: boolean;
      local?: boolean;
    }) => {
      const filePath = resolve(file);
      let content: string;

      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        console.log(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }

      // Validate first
      const { service, warnings } = parseAnvilYaml(content, { filePath });
      const toolCount = Object.keys(service.tools).length;

      console.log(chalk.bold(`\n  ${service.service.name}@${service.service.version}`));
      console.log(chalk.dim(`  ${toolCount} tool${toolCount !== 1 ? 's' : ''}: ${Object.keys(service.tools).join(', ')}`));

      if (warnings.length > 0) {
        for (const w of warnings) {
          console.log(chalk.yellow(`  WARN  ${w.message}`));
        }
      }

      if (opts.dryRun) {
        console.log(chalk.dim('\n  Dry run — not publishing.\n'));
        return;
      }

      if (opts.local) {
        // Local registry publish
        const { LocalRegistry } = await import('@anvil-tools/registry');
        const reg = new LocalRegistry();
        const pkg = await reg.publish({
          name: service.service.name,
          version: service.service.version,
          definition: content,
          tags: opts.tag,
        });
        console.log(chalk.green(`\n  Published to local registry.`));
        console.log(chalk.dim(`  ~/.anvil/registry/${pkg.name}\n`));
      } else {
        const saved = await loadSavedConfig();
        const token = opts.token ?? process.env['ANVIL_TOKEN'] ?? saved.token;
        const registry = opts.registry !== 'http://localhost:4400/api/v1'
          ? opts.registry
          : saved.registry ?? opts.registry;

        if (!token) {
          console.log(chalk.red('\n  Authentication required.'));
          console.log(chalk.dim('  Run `anvil login --token <token>` to save credentials.'));
          console.log(chalk.dim('  Or set ANVIL_TOKEN environment variable.\n'));
          process.exit(1);
        }

        const { RegistryClient } = await import('@anvil-tools/registry');
        const client = new RegistryClient({ registry, token });

        try {
          const pkg = await client.publish({
            name: service.service.name,
            version: service.service.version,
            definition: content,
            tags: opts.tag,
          }, token);

          console.log(chalk.green(`\n  Published ${pkg.name}@${pkg.version}`));
          console.log(chalk.dim(`  http://localhost:4400/api/v1/packages/${pkg.name}\n`));
        } catch (err) {
          console.log(chalk.red(`\n  Publish failed: ${err instanceof Error ? err.message : err}\n`));
          process.exit(1);
        }
      }
    });

  // ─── Search ───────────────────────────────────────────────────────

  program
    .command('search')
    .description('Search the Anvil registry for tool definitions')
    .argument('<query>', 'Search query')
    .option('--registry <url>', 'Registry URL', 'http://localhost:4400/api/v1')
    .option('--tag <tags...>', 'Filter by tags')
    .option('--local', 'Search local registry only')
    .action(async (query: string, opts: {
      registry: string;
      tag?: string[];
      local?: boolean;
    }) => {
      let results;

      if (opts.local) {
        const { LocalRegistry } = await import('@anvil-tools/registry');
        const reg = new LocalRegistry();
        results = await reg.search({ query, tags: opts.tag });
      } else {
        const { RegistryClient } = await import('@anvil-tools/registry');
        const client = new RegistryClient({ registry: opts.registry });
        results = await client.search({ query, tags: opts.tag });
      }

      if (results.packages.length === 0) {
        console.log(chalk.dim('\n  No packages found.\n'));
        return;
      }

      console.log(chalk.bold(`\n  ${results.total} package${results.total !== 1 ? 's' : ''} found\n`));

      for (const pkg of results.packages) {
        console.log(`  ${chalk.bold(pkg.name)}${chalk.dim('@' + pkg.version)}  ${chalk.dim('·')}  ${pkg.description}`);
        console.log(chalk.dim(`    ${pkg.tool_count} tools · ${pkg.downloads.weekly} weekly downloads`));
        if (pkg.tags.length > 0) {
          console.log(chalk.dim(`    tags: ${pkg.tags.join(', ')}`));
        }
        console.log();
      }
    });
}
