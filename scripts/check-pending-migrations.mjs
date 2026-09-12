#!/usr/bin/env node
/**
 * Fails if apps/api/migrations/ has a file the remote D1 hasn't applied yet.
 *
 * ADR-0009: the automatic deploy must never ship a Worker against a schema it doesn't
 * have, so this runs before every deploy and fails the job closed rather than guessing.
 * Applying a migration stays a separate, manual, watched step (see docs/OPERATIONS.md) --
 * this only checks whether one is owed, using the same `d1_migrations` table wrangler
 * itself tracks applied migrations in, queried with --json rather than parsed out of
 * `wrangler d1 migrations list`'s human-facing text.
 *
 * Run: npm run migrate:check
 */

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDir = join(repoRoot, 'apps', 'api');
const migrationsDir = join(apiDir, 'migrations');
const databaseName = 'grocery-list';

const localMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

// execSync, not execFileSync: resolving `npx` needs a shell, and execFileSync's own
// array-to-shell-command translation for the quoted --command value isn't reliable across
// shells. A single pre-quoted string handed straight to the shell is the same thing this
// query does correctly when typed by hand.
let output;
try {
  output = execSync(
    `npx wrangler d1 execute ${databaseName} --remote --command "select name from d1_migrations" --json`,
    { cwd: apiDir, encoding: 'utf8' },
  );
} catch (error) {
  console.error('Could not read the remote D1 migrations table -- treating as unsafe to deploy.');
  console.error(error.message);
  process.exit(1);
}

const [{ results }] = JSON.parse(output);
const applied = new Set(results.map((row) => row.name));

const pending = localMigrations.filter((name) => !applied.has(name));

if (pending.length > 0) {
  console.error(`Pending migration(s) not yet applied to the remote D1: ${pending.join(', ')}`);
  console.error('Apply them, then re-run this workflow to deploy:');
  console.error('  npm run migrate:remote -w @grocery/api');
  process.exit(1);
}

console.log(`All ${localMigrations.length} migration(s) are applied to the remote D1. Safe to deploy.`);
