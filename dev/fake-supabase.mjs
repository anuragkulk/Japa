// Local-only in-memory Supabase shim (dev). Implements just the chainable
// query surface the Japa handler uses. Never deployed; lives outside functions/.

function matches(row, filters) {
  return filters.every(({ column, op, value }) => {
    const rv = row[column];
    switch (op) {
      case "eq":
        return String(rv) === String(value);
      case "neq":
        return String(rv) !== String(value);
      default:
        return false;
    }
  });
}

class Query {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.mode = "select";
    this.payload = null;
    this.countExact = false;
    this.returnRows = false;
  }
  eq(column, value) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  neq(column, value) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }
  order(column, { ascending = true } = {}) {
    this.orders.push({ column, ascending });
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  select(_cols, opts) {
    this.returnRows = true;
    if (opts && opts.count === "exact") this.countExact = true;
    return this;
  }
  insert(obj) {
    this.mode = "insert";
    this.payload = obj;
    return this;
  }
  update(obj) {
    this.mode = "update";
    this.payload = obj;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  maybeSingle() {
    return this._run({ single: true });
  }
  single() {
    return this._run({ single: true });
  }
  then(resolve, reject) {
    return this._run({}).then(resolve, reject);
  }
  _run({ single = false }) {
    const all = this.rows[this.table] ?? (this.rows[this.table] = []);
    const matched = all.filter((r) => matches(r, this.filters));

    if (this.mode === "insert") {
      const row = { ...this.payload };
      all.push(row);
      return Promise.resolve({ data: this.returnRows ? row : null, error: null });
    }
    if (this.mode === "update") {
      let updated = null;
      for (const r of matched) Object.assign(r, this.payload), (updated = r);
      if (this.countExact) return Promise.resolve({ data: null, error: null, count: matched.length });
      return Promise.resolve({ data: this.returnRows ? updated : null, error: null });
    }
    if (this.mode === "delete") {
      const removed = matched.slice();
      this.rows[this.table] = all.filter((r) => !removed.includes(r));
      return Promise.resolve({
        data: this.returnRows ? removed[0] ?? null : null,
        error: null,
      });
    }

    // select
    let out = matched.slice();
    for (const { column, ascending } of this.orders.slice().reverse()) {
      out.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.countExact) {
      const total = out.length;
      if (this.limitN != null) out = out.slice(0, this.limitN);
      return Promise.resolve({ data: out, error: null, count: total });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    if (single) return Promise.resolve({ data: out[0] ?? null, error: null });
    return Promise.resolve({ data: out, error: null });
  }
}

export function createFakeSupabase() {
  const tables = {};
  const client = {
    from(table) {
      return new Query(table, tables);
    },
  };
  return { client, tables };
}
