// In-memory stand-in for @supabase/supabase-js, sufficient for the chainable
// query surface that supabase/functions/beatvision-world/index.ts uses.
//
// Supports: select, update, insert, eq, is, order, limit, maybeSingle, single.
// Filtered updates that match 0 rows cause .single() to return PGRST116 so
// confirmed-world immutability tests can assert conflict instead of a silent no-op.

export const storageBucketCalls = [];

export function createStubClientFactory(db) {
  return function createClient(url, key) {
    return {
      from(table) {
        let op = null;
        let payload = null;
        const filters = []; // [column, value, kind]
        let orderBy = null; // { column, ascending }
        let limitN = null;

        const matches = (row) =>
          filters.every(([col, val, kind]) => {
            if (kind === "is") return val === null ? row[col] == null : row[col] === val;
            return row[col] === val;
          });

        async function resolve() {
          let rows = [...(db[table] || [])].filter(matches);

          if (orderBy) {
            const { column, ascending } = orderBy;
            rows.sort((a, b) => {
              const av = a[column];
              const bv = b[column];
              if (av === bv) return 0;
              const cmp = av > bv ? 1 : -1;
              return ascending ? cmp : -cmp;
            });
          }
          if (limitN != null) rows = rows.slice(0, limitN);

          if (op === "select") return { data: rows, error: null };
          if (op === "insert") {
            const list = Array.isArray(payload) ? payload : [payload];
            const created = list.map((item, i) => ({
              id: `row-${(db[table] || []).length + i + 1}`,
              ...item,
            }));
            if (!db[table]) db[table] = [];
            db[table].push(...created);
            return { data: created, error: null };
          }
          if (op === "update") {
            const found = rows;
            for (const row of found) Object.assign(row, payload);
            return { data: found, error: null };
          }
          return { data: [], error: { message: `unsupported stub op: ${op}` } };
        }

        const api = {
          select() {
            if (op === null) op = "select";
            return api;
          },
          update(next) {
            op = "update";
            payload = next;
            return api;
          },
          insert(next) {
            op = "insert";
            payload = next;
            return api;
          },
          eq(column, value) {
            filters.push([column, value, "eq"]);
            return api;
          },
          is(column, value) {
            filters.push([column, value, "is"]);
            return api;
          },
          order(column, opts = {}) {
            orderBy = { column, ascending: opts.ascending !== false };
            return api;
          },
          limit(n) {
            limitN = n;
            return api;
          },
          async maybeSingle() {
            const { data, error } = await resolve();
            if (error) return { data: null, error };
            return data.length ? { data: data[0], error: null } : { data: null, error: null };
          },
          async single() {
            const { data, error } = await resolve();
            if (error) return { data: null, error };
            if (data.length === 1) return { data: data[0], error: null };
            return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
          },
          then(resolvePromise, rejectPromise) {
            return resolve().then(resolvePromise, rejectPromise);
          },
        };
        return api;
      },
      storage: {
        from: (bucket) => ({
          createSignedUrl: async (path) => {
            storageBucketCalls.push({ bucket, path });
            return { data: { signedUrl: "https://example.invalid/signed" }, error: null };
          },
        }),
      },
      auth: {},
    };
  };
}