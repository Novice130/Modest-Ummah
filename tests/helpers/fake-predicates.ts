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
