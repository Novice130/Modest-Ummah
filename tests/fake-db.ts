import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Stand-in for the Drizzle client. Nothing here opens a connection: each awaited
 * query takes the next queued result, and its arguments are recorded so a test
 * can inspect them. `whereSql` renders the WHERE clause to text, which proves
 * what was asked for but not how Postgres would answer it.
 */
export interface FakeCall {
  op: 'select' | 'insert' | 'update' | 'delete';
  values?: any;
  set?: any;
  where?: SQL;
}

export function makeFakeDb() {
  const queue: any[][] = [];
  const calls: FakeCall[] = [];

  function chain(op: FakeCall['op']) {
    const record: FakeCall = { op };
    calls.push(record);
    const builder: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: any, reject: any) =>
              Promise.resolve(queue.shift() ?? []).then(resolve, reject);
          }
          return (arg: any) => {
            if (prop === 'values' || prop === 'set' || prop === 'where') {
              (record as any)[prop] = arg;
            }
            return builder;
          };
        },
      }
    );
    return builder;
  }

  return {
    db: {
      select: () => chain('select'),
      insert: () => chain('insert'),
      update: () => chain('update'),
      delete: () => chain('delete'),
    },
    queue,
    calls,
    reset() {
      queue.length = 0;
      calls.length = 0;
    },
  };
}

export function whereSql(call: FakeCall): string {
  if (!call.where) return '';
  return new PgDialect().sqlToQuery(call.where).sql;
}

export function whereParams(call: FakeCall): unknown[] {
  if (!call.where) return [];
  return new PgDialect().sqlToQuery(call.where).params;
}

export function renderSql(fragment: SQL): string {
  return new PgDialect().sqlToQuery(fragment).sql;
}

export function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'customer@example.com',
    name: 'Customer',
    passwordHash: null,
    authProvider: 'email',
    providerId: null,
    avatar: null,
    verified: false,
    tokenVersion: 3,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
