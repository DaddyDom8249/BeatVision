// In-memory stand-in for @supabase/supabase-js, sufficient for the chainable
// query surface that supabase/functions/beatvision-world/index.ts uses.

export function createStubClientFactory(db) {
  return function createClient(url, key) {
    return {
      from(table) {
        let op = null;
        let payload = null;
        const filters = [];

        const matches = (row) => filters.every(([col, val]) => row[col] === val);

        async function resolve() {
          const rows = db[table] || [];
          if (op === "select") {
            const found = rows.filter(matches);
            return { data: found, error: null };
          }
          if (op === "insert") {
            const created = { id: `row-${rows.length + 1}`, ...payload };
            rows.push(created);
            return { data: [created], error: null };
          }
          if (op === "update") {
            const found = rows.filter(matches);
            for (const row of found) Object.assign(row, payload);
            return { data: found, error: null };
          }
          return { data: [], error: { message: `unsupported stub op: ${op}` } };
        }

        const api = {
          // .select() after .update()/.insert() is a modifier, not a new
          // operation: it must not discard the pending write.
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
            filters.push([column, value]);
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
            return data.length
              ? { data: data[0], error: null }
              : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
          },
          then(resolvePromise, rejectPromise) {
            return resolve().then(resolvePromise, rejectPromise);
          },
        };
        return api;
      },
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/signed" }, error: null }),
        }),
      },
      auth: {},
    };
  };
}