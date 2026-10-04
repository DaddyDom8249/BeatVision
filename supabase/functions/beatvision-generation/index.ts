// BeatVision Generation Controller
// Server-side only. Durable state lives in generation_jobs.
// Provider credentials never leave this Edge Function.

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, status: "not_implemented" }), {
    headers: { "Content-Type": "application/json" },
  });
});
