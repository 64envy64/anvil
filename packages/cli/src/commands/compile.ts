/**
 * `anvil compile` — compile tool definitions to target outputs.
 *
 * Two modes:
 *   1. With config:    anvil compile -c anvil.config.ts
 *   2. Zero-config:    anvil compile --target mcp
 *                      anvil compile --target mcp,docs,openapi
 *                      anvil compile --all
 *
 * Zero-config mode finds *.anvil.yaml files in the current directory
 * and compiles them using built-in targets — no config file needed.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { stat } from 'node:fs/promises';
import { glob } from 'glob';
import chalk from 'chalk';
import {
  compile as runCompile,
  writeOutput,
  loadConfig,
  type AnvilConfig,
  type AnvilTarget,
} from '@anvil-tools/compiler';
import { AnvilError } from '@anvil-tools/schema';
import type { Command } from 'commander';

// ─── Built-in target registry ───────────────────────────────────────────────

const BUILT_IN_TARGETS: Record<string, () => Promise<AnvilTarget>> = {
  mcp:           async () => (await import('@anvil-tools/target-mcp')).mcp(),
  openapi:       async () => (await import('@anvil-tools/target-openapi')).openapi(),
  docs:          async () => (await import('@anvil-tools/target-docs')).docs(),
  'agent-schema': async () => (await import('@anvil-tools/target-agent-schema')).agentSchema(),
  eval:          async () => (await import('@anvil-tools/target-eval')).evalTarget(),
  'sdk-ts':      async () => (await import('@anvil-tools/target-sdk-ts')).sdkTypescript(),
  'cli-gen':     async () => (await import('@anvil-tools/target-cli-gen')).cliTarget(),
  anthropic:     async () => (await import('@anvil-tools/target-anthropic')).anthropic(),
  openai:        async () => (await import('@anvil-tools/target-openai')).openai(),
  'vercel-ai':   async () => (await import('@anvil-tools/target-vercel-ai')).vercelAI(),
};

const TARGET_NAMES = Object.keys(BUILT_IN_TARGETS);

async function resolveTargets(targetArg: string): Promise<AnvilTarget[]> {
  const names = targetArg.split(',').map(s => s.trim()).filter(Boolean);
  const targets: AnvilTarget[] = [];

  for (const name of names) {
    const factory = BUILT_IN_TARGETS[name];
    if (!factory) {
      console.log(chalk.red(`  Unknown target: "${name}"`));
      console.log(chalk.dim(`  Available: ${TARGET_NAMES.join(', ')}`));
      process.exit(1);
    }
    targets.push(await factory());
  }

  return targets;
}

// ─── Command ────────────────────────────────────────────────────────────────

export function registerCompileCommand(program: Command): void {
  program
    .command('compile')
    .description('Compile .anvil.yaml files to target outputs')
    .option('-c, --config <path>', 'Path to anvil.config.ts')
    .option('-o, --out-dir <dir>', 'Output directory', 'out')
    .option('-t, --target <targets>', 'Targets to compile (comma-separated: mcp,docs,openapi)')
    .option('--all', 'Compile to all 10 built-in targets')
    .option('--dry-run', 'Show what would be generated without writing')
    .action(async (opts: {
      config?: string;
      outDir: string;
      target?: string;
      all?: boolean;
      dryRun?: boolean;
    }) => {

      // ─── Determine targets ──────────────────────────────

      let targets: AnvilTarget[];
      let toolPatterns: string[];
      let outDir: string;

      if (opts.config) {
        // Explicit config mode
        const configPath = resolve(opts.config);
        let config: AnvilConfig;
        try {
          config = await loadConfig(configPath);
        } catch (err) {
          console.log(chalk.red(`Failed to load config: ${configPath}`));
          console.log(chalk.dim(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
        targets = config.targets;
        toolPatterns = Array.isArray(config.tools) ? config.tools : [config.tools];
        outDir = resolve(opts.outDir !== 'out' ? opts.outDir : config.outDir ?? 'out');

        // Filter targets if --target also provided
        if (opts.target) {
          const wanted = opts.target.split(',').map(s => s.trim());
          targets = targets.filter(t => wanted.includes(t.name));
        }
      } else if (opts.target || opts.all) {
        // Zero-config mode
        if (opts.all) {
          targets = await Promise.all(Object.values(BUILT_IN_TARGETS).map(f => f()));
        } else {
          targets = await resolveTargets(opts.target!);
        }
        toolPatterns = ['**/*.anvil.yaml'];
        outDir = resolve(opts.outDir);
      } else {
        // Try to find config, fall back to helpful message
        const defaultConfig = resolve('anvil.config.ts');
        let hasConfig = false;
        try { await stat(defaultConfig); hasConfig = true; } catch {}

        if (hasConfig) {
          let config: AnvilConfig;
          try {
            config = await loadConfig(defaultConfig);
          } catch (err) {
            console.log(chalk.red(`Failed to load anvil.config.ts`));
            console.log(chalk.dim(err instanceof Error ? err.message : String(err)));
            process.exit(1);
          }
          targets = config.targets;
          toolPatterns = Array.isArray(config.tools) ? config.tools : [config.tools];
          outDir = resolve(config.outDir ?? 'out');
        } else {
          // No config, no --target — show help
          console.log(chalk.bold('\n  anvil compile — choose your targets:\n'));
          console.log(chalk.dim('  Zero-config (recommended):'));
          console.log(`    ${chalk.cyan('anvil compile --target mcp')}              MCP server for Claude/Cursor`);
          console.log(`    ${chalk.cyan('anvil compile --target mcp,docs')}         MCP + documentation`);
          console.log(`    ${chalk.cyan('anvil compile --target anthropic')}        Claude API tool format`);
          console.log(`    ${chalk.cyan('anvil compile --all')}                     All 10 targets`);
          console.log();
          console.log(chalk.dim('  Available targets:'));
          console.log(chalk.dim(`    ${TARGET_NAMES.join(', ')}`));
          console.log();
          console.log(chalk.dim('  With config file:'));
          console.log(chalk.dim('    anvil compile -c anvil.config.ts'));
          console.log();
          process.exit(0);
        }
      }

      if (targets.length === 0) {
        console.log(chalk.yellow('  No targets configured.'));
        console.log(chalk.dim('  Use --target mcp or --all, or add targets to anvil.config.ts'));
        process.exit(1);
      }

      // ─── Find and read source files ─────────────────────

      const files = (await Promise.all(
        toolPatterns.map(p => glob(p, { ignore: 'node_modules/**' })),
      )).flat().map(f => resolve(f));

      if (files.length === 0) {
        console.log(chalk.yellow('  No .anvil.yaml files found.'));
        console.log(chalk.dim('  Run `anvil init` to create one.'));
        process.exit(1);
      }

      const sources = await Promise.all(
        files.map(async filePath => ({
          content: await readFile(filePath, 'utf-8'),
          filePath,
        })),
      );

      // ─── Compile ────────────────────────────────────────

      const targetNames = targets.map(t => t.name).join(', ');
      console.log(chalk.bold(`\n  Compiling ${files.length} file${files.length !== 1 ? 's' : ''} → ${targets.length} target${targets.length !== 1 ? 's' : ''} (${targetNames})\n`));

      try {
        const result = await runCompile({ sources, targets });

        for (const d of result.diagnostics) {
          if (d.severity === 'error') console.log(chalk.red(`  ERROR  ${d.message}`));
          else if (d.severity === 'warning') console.log(chalk.yellow(`  WARN   ${d.message}`));
        }

        if (result.diagnostics.some(d => d.severity === 'error')) process.exit(1);

        if (opts.dryRun) {
          for (const tr of result.targets) {
            console.log(chalk.cyan(`  ${tr.target}/`));
            for (const file of tr.files) {
              console.log(chalk.dim(`    ${file.path} (${file.content.length} bytes)`));
            }
          }
          console.log(chalk.dim('\n  Dry run — no files written.\n'));
        } else {
          const written = await writeOutput(result.targets, outDir);
          for (const p of written) {
            console.log(chalk.green('  +') + ' ' + chalk.dim(relative(process.cwd(), p)));
          }
          console.log(chalk.green(`\n  ${written.length} files generated in ${relative(process.cwd(), outDir)}/\n`));
        }
      } catch (err) {
        if (err instanceof AnvilError) {
          console.log(chalk.red('\n  Compilation failed:\n'));
          console.log(err.format());
          process.exit(1);
        }
        throw err;
      }
    });
}
