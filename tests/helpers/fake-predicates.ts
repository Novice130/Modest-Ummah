type Row = Record<string, any>;

const keyOf = (column: any) =>
  String(column.name).replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

function matches(p: any, r: Row) {
  return typeof p === 'function' ? p(r) : true;
}

export const predicates = {
  eq: (c: any, v: any) => (r: Row) => r[keyOf(c)] === v,
  ne: (c: any, v: any) => (r: Row) => r[keyOf(c)] !== v,
  inArray: (c: any, vs: any[]) => (r: Row) => vs.includes(r[keyOf(c)]),
  notInArray: (c: any, vs: any[]) => (r: Row) => !vs.includes(r[keyOf(c)]),
  and: (...ps: any[]) => (r: Row) => ps.every((p) => matches(p, r)),
};

/** A drizzle column (compared column to column) or a plain value. */
const valueOf = (r: Row, v: any) =>
  v && typeof v === 'object' && 'name' in v && 'table' in v ? r[keyOf(v)] : v;

/**
 * Opt-in extras for tests that need limits and time windows evaluated. Kept
 * out of `predicates` so suites that rely on these matching every row do not
 * change behaviour.
 */
export const comparisonPredicates = {
  or: (...ps: any[]) => (r: Row) => ps.some((p) => typeof p === 'function' && p(r)),
  isNull: (c: any) => (r: Row) => r[keyOf(c)] === null || r[keyOf(c)] === undefined,
  lt: (c: any, v: any) => (r: Row) => r[keyOf(c)] < valueOf(r, v),
};
