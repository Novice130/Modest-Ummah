/**
 * Compare a Neon database's tables and columns with lib/schema.ts. READ-ONLY.
 *
 * Every query is a SELECT on information_schema, sent in a READ ONLY
 * transaction, so the server refuses a write even if one were added here.
 * The script does not load .env: the URL has to be given on purpose, and it is
 * never printed. Output is table and column names only, no row data.
 *
 * Compared: tables, column presence, type, nullability, whether a default or
 * identity exists. Not compared: indexes, foreign keys, enum labels, default
 * expressions. information_schema lists only what the connecting role can
 * access, so a role without SELECT on a table reports it as missing.
 *
 * Usage:  DATABASE_URL='postgresql://...' node scripts/compare-schema.mjs
 *         node scripts/compare-schema.mjs --expected   (no database)
 *
 * Exit:   0 no differences, 1 differences found, 2 usage, 3 could not compare
 */

import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SCHEMA_PATH = fileURLToPath(new URL('../lib/schema.ts', import.meta.url));

const USAGE = `Compare a database's tables and columns with lib/schema.ts. Read-only.

Usage:
  DATABASE_URL='postgresql://...' node scripts/compare-schema.mjs
  node scripts/compare-schema.mjs --expected    print what lib/schema.ts expects; no database

The URL comes from the DATABASE_URL environment variable only, because command
arguments are visible in shell history and process lists. .env is not loaded.

Exit codes: 0 no differences, 1 differences found, 2 usage, 3 could not compare.`;

/** Evaluate lib/schema.ts in memory and return { table: { column: spec } }. */
export function loadExpected() {
  const ts = require('typescript');
  const { getTableConfig, PgTable } = require('drizzle-orm/pg-core');
  const { is } = require('drizzle-orm');

  const { outputText } = ts.transpileModule(readFileSync(SCHEMA_PATH, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const schemaModule = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(require, schemaModule, schemaModule.exports);

  const expected = {};
  for (const value of Object.values(schemaModule.exports)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    const columns = {};
    for (const column of config.columns) {
      const identity = Boolean(column.generatedIdentity);
      columns[column.name] = {
        type: normalizeType(column.getSQLType()),
        nullable: !(column.notNull || column.primary),
        identity,
        hasDefault: !identity && Boolean(column.hasDefault),
      };
    }
    expected[config.name] = columns;
  }
  return expected;
}

function normalizeType(type) {
  return type.replace(/\s+/g, '').toLowerCase();
}

function dbType(row) {
  if (row.data_type === 'USER-DEFINED') return normalizeType(row.udt_name);
  if (row.data_type === 'timestamp without time zone') return 'timestamp';
  if (row.data_type === 'timestamp with time zone') return 'timestamptz';
  if (row.data_type === 'numeric' && row.numeric_precision != null) {
    return `numeric(${row.numeric_precision},${row.numeric_scale})`;
  }
  return normalizeType(row.data_type);
}

/** Turn information_schema.columns rows into the shape loadExpected() returns. */
export function actualFromRows(tableRows, columnRows) {
  const actual = {};
  for (const { table_name } of tableRows) actual[table_name] = {};
  for (const row of columnRows) {
    if (!actual[row.table_name]) continue;
    const identity = row.is_identity === 'YES';
    actual[row.table_name][row.column_name] = {
      type: dbType(row),
      nullable: row.is_nullable === 'YES',
      identity,
      hasDefault: !identity && row.column_default != null,
    };
  }
  return actual;
}

/** Returns sorted lines describing each difference; empty when they match. */
export function diffSchemas(expected, actual) {
  const lines = [];
  for (const table of Object.keys(expected)) {
    if (!actual[table]) lines.push(`table only in lib/schema.ts: ${table}`);
  }
  for (const table of Object.keys(actual)) {
    if (!expected[table]) lines.push(`table only in database: ${table}`);
  }
  for (const table of Object.keys(expected)) {
    if (!actual[table]) continue;
    const want = expected[table];
    const have = actual[table];
    for (const column of Object.keys(want)) {
      if (!have[column]) {
        lines.push(`column only in lib/schema.ts: ${table}.${column} (${want[column].type})`);
        continue;
      }
      for (const key of ['type', 'nullable', 'identity', 'hasDefault']) {
        if (want[column][key] !== have[column][key]) {
          lines.push(
            `column differs: ${table}.${column} ${key}: ` +
              `schema=${want[column][key]} database=${have[column][key]}`
          );
        }
      }
    }
    for (const column of Object.keys(have)) {
      if (!want[column]) {
        lines.push(`column only in database: ${table}.${column} (${have[column].type})`);
      }
    }
  }
  return lines.sort();
}

/** Remove the URL, its password, and anything shaped like a connection string. */
export function scrub(message, url) {
  let text = String(message);
  if (url) {
    text = text.split(url).join('[redacted]');
    try {
      const { password } = new URL(url);
      if (password) {
        text = text.split(password).join('[redacted]');
        text = text.split(decodeURIComponent(password)).join('[redacted]');
      }
    } catch {
      // An unparseable URL never reaches a query; the pattern below still applies.
    }
  }
  return text.replace(/postgres(ql)?:\/\/\S+/gi, '[redacted]');
}

function isPostgresUrl(value) {
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function readDatabase(url) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const [tables, columns, migrations] = await sql.transaction(
    (tx) => [
      tx`SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      tx`SELECT table_name, column_name, data_type, udt_name, is_nullable,
                column_default, is_identity, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'public'`,
      tx`SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`,
    ],
    { readOnly: true }
  );
  return { tables, columns, hasMigrationsTable: migrations.length > 0 };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] === '--expected') {
    const expected = loadExpected();
    for (const table of Object.keys(expected).sort()) {
      console.log(table);
      for (const [column, spec] of Object.entries(expected[table])) {
        const flags = [
          spec.nullable ? 'null' : 'not null',
          spec.identity ? 'identity' : null,
          spec.hasDefault ? 'default' : null,
        ].filter(Boolean);
        console.log(`  ${column}  ${spec.type}  ${flags.join(', ')}`);
      }
    }
    return 0;
  }

  // Arguments are not echoed: one of them could be a pasted connection string.
  if (args.length > 0) {
    console.error(`Unexpected arguments.\n\n${USAGE}`);
    return 2;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL is not set.\n\n${USAGE}`);
    return 2;
  }
  if (!isPostgresUrl(url)) {
    console.error(`DATABASE_URL is not a postgres:// or postgresql:// URL.\n\n${USAGE}`);
    return 2;
  }

  try {
    const expected = loadExpected();
    const { tables, columns, hasMigrationsTable } = await readDatabase(url);
    const differences = diffSchemas(expected, actualFromRows(tables, columns));

    console.log(`lib/schema.ts tables: ${Object.keys(expected).length}`);
    console.log(`database tables (public): ${tables.length}`);
    console.log(`drizzle.__drizzle_migrations exists: ${hasMigrationsTable ? 'yes' : 'no'}`);
    if (differences.length === 0) {
      console.log('No differences in tables or columns.');
      return 0;
    }
    console.log(`\n${differences.length} difference(s):`);
    for (const line of differences) console.log(`  ${line}`);
    return 1;
  } catch (error) {
    console.error(`Could not compare: ${scrub(error?.message ?? error, url)}`);
    return 3;
  }
}

const invokedDirectly =
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  process.exitCode = await main();
}
