import { getTableName } from 'drizzle-orm';
export { predicates } from './fake-predicates';

/**
 * In-memory stand-in for the small part of drizzle the shop code uses. Nothing
 * here opens a connection. Predicates come from fake-predicates (which has no
 * drizzle-orm dependency, avoiding vi.mock circular imports); raw `sql`
 * conditions cannot be evaluated, so they match every row.
 */
type Row = Record<string, any>;
type Op = 'select' | 'insert' | 'update' | 'delete';

function matches(p: any, r: Row) {
  return typeof p === 'function' ? p(r) : true;
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = {};
  const rowsOf = (t: any) => (tables[getTableName(t)] ??= []);
  const failures: Array<{ table: string; op: Op }> = [];
  const log: Array<{ table: string; op: Op; values?: Row }> = [];

  const check = (table: any, op: Op) => {
    const name = getTableName(table);
    const i = failures.findIndex((f) => f.table === name && f.op === op);
    if (i >= 0) {
      failures.splice(i, 1);
      throw new Error(`injected ${op} failure on ${name}`);
    }
  };

  const thenable = <T extends object>(builder: T, run: () => any) =>
    Object.assign(builder, {
      then: (ok: any, bad: any) => Promise.resolve().then(run).then(ok, bad),
    });

  const db = {
    select: () => ({
      from: (table: any) => {
        let where: any;
        let limit = Infinity;
        const b: any = {
          where: (p: any) => ((where = p), b),
          limit: (n: number) => ((limit = n), b),
        };
        return thenable(b, () => {
          check(table, 'select');
          return rowsOf(table).filter((r) => matches(where, r)).slice(0, limit);
        });
      },
    }),
    insert: (table: any) => ({
      values: (v: Row) => {
        let ignoreConflict = false;
        const run = () => {
          check(table, 'insert');
          log.push({ table: getTableName(table), op: 'insert', values: v });
          const pk = getTableName(table) === 'stripe_events' ? 'eventId' : null;
          if (pk && rowsOf(table).some((r) => r[pk] === v[pk])) {
            if (ignoreConflict) return [];
            throw new Error('duplicate key');
          }
          const row = { processedAt: new Date(), ...v };
          rowsOf(table).push(row);
          return [row];
        };
        const b: any = {
          onConflictDoNothing: () => ((ignoreConflict = true), b),
          returning: () => b,
        };
        return thenable(b, run);
      },
    }),
    update: (table: any) => ({
      set: (s: Row) => {
        let where: any;
        const b: any = { where: (p: any) => ((where = p), b), returning: () => b };
        return thenable(b, () => {
          check(table, 'update');
          log.push({ table: getTableName(table), op: 'update', values: s });
          const hit = rowsOf(table).filter((r) => matches(where, r));
          hit.forEach((r) => Object.assign(r, s));
          return hit;
        });
      },
    }),
    delete: (table: any) => ({
      where: (p: any) =>
        thenable({}, () => {
          check(table, 'delete');
          tables[getTableName(table)] = rowsOf(table).filter((r) => !matches(p, r));
        }),
    }),
  };

  return {
    db,
    seed: (table: any, rows: Row[]) => rowsOf(table).push(...rows),
    rows: (table: any) => rowsOf(table),
    failNext: (table: string, op: Op) => failures.push({ table, op }),
    log,
  };
}
