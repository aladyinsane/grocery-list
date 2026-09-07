/**
 * A minimal D1 stand-in backed by Node's built-in SQLite.
 *
 * D1 *is* SQLite, so running the real migration and the real queries against a real
 * SQLite engine tests the thing that actually matters: whether the SQL behaves the way
 * ADR-0005 claims -- the conditional updates, the ON CONFLICT clauses, the revision
 * subqueries, and the fact that a batch is one atomic transaction.
 *
 * Only the surface `src/db.ts` uses is implemented. It is deliberately small; the moment
 * it needs to grow much, that is a sign the queries have got too clever.
 */

import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Row = Record<string, unknown>;

class FakeStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly args: unknown[] = [],
  ) {}

  bind(...args: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, args);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...(this.args as never[])) as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.execute() as T[] };
  }

  async run(): Promise<{ success: true }> {
    this.execute();
    return { success: true };
  }

  /** node:sqlite splits reads and writes; D1 does not, so pick the right one by shape. */
  private execute(): Row[] {
    const statement = this.db.prepare(this.sql);
    if (/^\s*(select|with)\b/i.test(this.sql)) {
      return statement.all(...(this.args as never[])) as Row[];
    }
    statement.run(...(this.args as never[]));
    return [];
  }
}

export class FakeD1 {
  private readonly db = new DatabaseSync(':memory:');

  constructor() {
    this.db.exec('PRAGMA foreign_keys = ON');
    // Every migration, in order -- the same set `wrangler d1 migrations apply` runs. Doing
    // this by directory rather than by name means a new migration needs no change here.
    const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(dir + file, 'utf8'));
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.db, sql);
  }

  /** One transaction, statements in order -- which is what db.ts relies on. */
  async batch<T = unknown>(statements: FakeStatement[]): Promise<{ results: T[] }[]> {
    this.db.exec('BEGIN');
    try {
      const results: { results: T[] }[] = [];
      for (const statement of statements) results.push(await statement.all<T>());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** `src/db.ts` is typed against Cloudflare's D1Database; the shim covers what it calls. */
export function asD1(fake: FakeD1): D1Database {
  return fake as unknown as D1Database;
}
