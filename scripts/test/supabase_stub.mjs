// In-memory stand-in for @supabase/supabase-js, sufficient for the chainable
// query surface that supabase/functions/beatvision-world/index.ts uses.

// Records every storage bucket the function asks for, so tests can assert
// against production bucket names (e.g. `songs` rather than the stale `audio`).
export const storageBucketCalls = [];

export function createStubClientFactory(db) {
  return function createClient(url, key) {
    return {
      from(table) {
        let op = null;
        let payload = null;
        const filters = [];
        const nullFilters = [];
        let orderBy = null;
        let orderAscending = true;
        let limitCount = null;

        const matches = (row) =>
          filters.every(([col, val]) => row[col] === val) &&
          nullFilters.every(([col, val]) => row[col] === val);

        async function resolve() {
          const rows = db[table] || [];
          if (op === "select") {
            let found = rows.filter(matches);
            if (orderBy) {
              found = [...found].sort((a, b) => {
                const av = a[orderBy];
                const bv = b[orderBy];
                if (av === bv) return 0;
                if (av === undefined || av === null) return 1;
                if (bv === undefined || bv === null) return -1;
                if (av < bv) return orderAscending ? -1 : 1;
                return orderAscending ? 1 : -1;
              });
            }
            if (limitCount !== null) found = found.slice(0, limitCount);
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
          is(column, value) {
            nullFilters.push([column, value]);
            return api;
          },
          order(column, options = {}) {
            orderBy = column;
            orderAscending = options.ascending !== false;
            return api;
          },
          limit(count) {
            limitCount = count;
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
        from: (bucket) => ({
          createSignedUrl: async (path) => {
            storageBucketCalls.push({ bucket, path });
            return { data: { signedUrl: "https://example.invalid/signed" }, error: null };
          },
        }),
      },
      rpc(name, args = {}) {
        if (name === "confirm_world_atomic") {
          const project = db.projects.find((row) => row.id === args.p_project_id);
          const report = db.world_reports
            .filter((row) => row.project_id === args.p_project_id)
            .sort((a, b) => Number(b.revision_number) - Number(a.revision_number))[0];

          if (!project || project.owner_id !== db.__authUserId) {
            return Promise.resolve({ data: null, error: { code: "42501", message: "WORLD_PROJECT_NOT_FOUND_OR_FORBIDDEN" } });
          }
          if (!report || report.status !== "completed") {
            return Promise.resolve({ data: null, error: { code: "P0001", message: "WORLD_NOT_READY" } });
          }
          if (report.confirmed_at) return Promise.resolve({ data: report, error: null });

          const confirmedAt = new Date().toISOString();
          report.confirmed_at = confirmedAt;
          project.world_report_id = report.id;
          project.world_confirmed_at = confirmedAt;
          return Promise.resolve({ data: report, error: null });
        }

        if (name === "create_world_revision_atomic") {
          const project = db.projects.find((row) => row.id === args.p_project_id);
          const current = project
            ? db.world_reports.find((row) => row.id === project.world_report_id && row.project_id === args.p_project_id)
            : null;

          if (!project || project.owner_id !== db.__authUserId) {
            return Promise.resolve({ data: null, error: { code: "42501", message: "WORLD_PROJECT_NOT_FOUND_OR_FORBIDDEN" } });
          }
          if (!current || !current.confirmed_at || !project.world_confirmed_at) {
            return Promise.resolve({ data: null, error: { code: "P0001", message: "WORLD_REVISION_REQUIRES_CONFIRMED" } });
          }

          const revision = {
            ...current,
            id: "revision-2",
            revision_number: Number(current.revision_number) + 1,
            confirmed_at: null,
            ...Object.fromEntries(Object.entries(args.p_world || {})),
            raw_report: {
              ...(current.raw_report && typeof current.raw_report === "object" ? current.raw_report : {}),
              parent_world_report_id: current.id,
              parent_revision_number: current.revision_number,
              artist_edits: args.p_artist_edits,
            },
          };
          db.world_reports.push(revision);
          project.world_report_id = revision.id;
          project.world_confirmed_at = null;
          return Promise.resolve({ data: revision, error: null });
        }

        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Unknown RPC: " + name } });
      },
      auth: {},
    };
  };
}
