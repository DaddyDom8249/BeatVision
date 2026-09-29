# Security

Browser → authenticated Supabase request → Edge Function → Arena → provider.

Never expose provider secrets in browser code, APKs, public environment variables, GitHub source, or database rows.

Validate authentication and project ownership before mutating data.
