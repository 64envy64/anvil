/**
 * `anvil install` — download and set up tool definitions from the registry.
 * `anvil login`   — save auth token for publishing.
 */

import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { Command } from 'commander';

const CONFIG_DIR = join(homedir(), '.anvil');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface AnvilConfig {
  registry?: string;
  token?: string;
}

async function loadCliConfig(): Promise<AnvilConfig> {
  try { return JSON.parse(await readFile(CONFIG_FILE, 'utf-8')); }
  catch { return {}; }
}

async function saveCliConfig(config: AnvilConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function registerInstallCommand(program: Command): void {
  // ─── anvil install ────────────────────────────────────────────

  program
    .command('install')
    .description('Install a tool definition from the Anvil registry')
    .argument('<package>', 'Package name (e.g. weather-tools or weather-tools@1.0.0)')
    .option('--registry <url>', 'Registry URL')
    .option('-o, --output <file>', 'Output file path')
    .option('--compile', 'Compile immediately after installing')
    .action(async (pkgArg: string, opts: { registry?: string; output?: string; compile?: boolean }) => {
      const config = await loadCliConfig();
      const registryUrl = (opts.registry ?? config.registry ?? 'http://localhost:4400/api/v1').replace(/\/$/, '');

      // Parse package@version
      const atIndex = pkgArg.lastIndexOf('@');
      const name = atIndex > 0 ? pkgArg.slice(0, atIndex) : pkgArg;
      const version = atIndex > 0 ? pkgArg.slice(atIndex + 1) : undefined;

      // First, get package info
      const infoUrl = `${registryUrl}/packages/${encodeURIComponent(name)}`;
      const defUrl = version
        ? `${registryUrl}/packages/${encodeURIComponent(name)}/versions/${version}/definition`
        : `${registryUrl}/packages/${encodeURIComponent(name)}/definition`;

      console.log(chalk.dim(`\n  Fetching ${name}${version ? '@' + version : ''} from registry...`));

      try {
        // Get package metadata
        let pkgInfo: any = null;
        try {
          const infoRes = await fetch(infoUrl);
          if (infoRes.ok) pkgInfo = await infoRes.json();
        } catch { /* optional */ }

        // Get definition
        const res = await fetch(defUrl);

        if (res.status === 404) {
          console.log(chalk.red(`\n  Package "${name}" not found.`));
          console.log(chalk.dim(`  Registry: ${registryUrl}`));
          console.log(chalk.dim(`  Run \`anvil search ${name.split('-')[0]}\` to find similar packages.\n`));
          process.exit(1);
        }

        if (!res.ok) {
          const body = await res.text();
          console.log(chalk.red(`\n  Failed (${res.status}): ${body}`));
          process.exit(1);
        }

        const definition = await res.text();
        const outputFile = opts.output ?? `${name}.anvil.yaml`;
        await writeFile(resolve(outputFile), definition);

        // Print success with package info
        console.log(chalk.green(`\n  Installed ${name}${version ? '@' + version : ''}`));
        console.log(chalk.dim(`  → ${outputFile}`));

        if (pkgInfo) {
          const tools = pkgInfo.tool_names ?? [];
          if (tools.length > 0) {
            console.log(chalk.dim(`  Tools: ${tools.join(', ')}`));
          }
          if (pkgInfo.description) {
            console.log(chalk.dim(`  ${pkgInfo.description}`));
          }
        }

        // Check if anvil.config.ts exists and suggest adding the file
        const configPath = resolve('anvil.config.ts');
        let hasConfig = false;
        try { await stat(configPath); hasConfig = true; } catch {}

        if (hasConfig) {
          console.log(chalk.dim(`\n  Config found. Add to your anvil.config.ts tools glob if needed:`));
          console.log(chalk.dim(`    tools: ['./*.anvil.yaml', './${outputFile}']`));
        }

        console.log();

        if (opts.compile) {
          console.log(chalk.dim('  Validating...'));
          const { parseAnvilYaml } = await import('@anvil-tools/schema');
          const { service } = parseAnvilYaml(definition, { filePath: outputFile });
          const toolCount = Object.keys(service.tools).length;
          console.log(chalk.green(`  Valid: ${toolCount} tools in ${service.service.name}`));
          console.log(chalk.dim('\n  Run `anvil compile` to generate targets.\n'));
        } else {
          console.log(chalk.dim('  Next: anvil validate && anvil compile\n'));
        }
      } catch (err) {
        if (err instanceof Error && 'code' in err && (err as any).code === 'ECONNREFUSED') {
          console.log(chalk.red(`\n  Cannot connect to registry at ${registryUrl}`));
          console.log(chalk.dim('  Is the hub running? Start with: cd packages/hub && npm run dev\n'));
        } else {
          console.log(chalk.red(`\n  Error: ${err instanceof Error ? err.message : err}\n`));
        }
        process.exit(1);
      }
    });

  // ─── anvil login ──────────────────────────────────────────────

  program
    .command('login')
    .description('Save registry auth token for publishing')
    .option('--token <token>', 'Auth token')
    .option('--registry <url>', 'Registry URL')
    .action(async (opts: { token?: string; registry?: string }) => {
      const config = await loadCliConfig();

      if (opts.registry) config.registry = opts.registry;

      const token = opts.token ?? process.env['ANVIL_TOKEN'];
      if (!token) {
        console.log(chalk.yellow('\n  No token provided.'));
        console.log(chalk.dim('  Usage: anvil login --token <your-token>'));
        console.log(chalk.dim('  Or set ANVIL_TOKEN environment variable.'));
        console.log(chalk.dim('\n  To get a token, ask the hub admin or run:'));
        console.log(chalk.dim('    curl -X POST http://hub/api/v1/tokens \\'));
        console.log(chalk.dim('      -H "Authorization: Bearer ADMIN_TOKEN" \\'));
        console.log(chalk.dim('      -d \'{"owner": "your-name"}\'\n'));
        process.exit(1);
      }

      config.token = token;
      await saveCliConfig(config);

      console.log(chalk.green(`\n  Logged in.`));
      console.log(chalk.dim(`  Token saved to ${CONFIG_FILE}`));
      if (config.registry) console.log(chalk.dim(`  Registry: ${config.registry}`));
      console.log();

      // Verify token works
      const registryUrl = (config.registry ?? 'http://localhost:4400/api/v1').replace(/\/$/, '');
      try {
        const res = await fetch(`${registryUrl}/stats`);
        if (res.ok) {
          const stats = await res.json() as { packages: number };
          console.log(chalk.dim(`  Registry has ${stats.packages} packages.\n`));
        }
      } catch {
        console.log(chalk.dim(`  (Could not verify — registry may be offline)\n`));
      }
    });
}
