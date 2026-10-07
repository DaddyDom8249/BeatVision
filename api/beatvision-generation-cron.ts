import type { VercelRequest, VercelResponse } from "@vercel/node";

const json = (res: VercelResponse, status: number, body: unknown) => {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "GET or POST required." });

  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const auth = String(req.headers.authorization || "");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) return json(res, 401, { error: "Unauthorized." });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRole) return json(res, 500, { error: "Scheduler is not configured." });

  const jobsResponse = await fetch(
    `${supabaseUrl}/rest/v1/generation_jobs?select=id,project_id,status&status=in.(queued,processing)&order=created_at.asc&limit=8`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } },
  );
  if (!jobsResponse.ok) return json(res, 502, { error: "Queue lookup failed." });

  const jobs = await jobsResponse.json() as Array<{ id: string; project_id: string; status: string }>;
  const results = [];

  for (const job of jobs) {
    const action = job.status === "processing" ? "poll" : "run";
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/beatvision-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRole}` },
        body: JSON.stringify({ projectId: job.project_id, jobId: job.id, action }),
      });
      const body = await response.json().catch(() => ({}));
      results.push({ id: job.id, action, http_status: response.status, status: body?.job?.status || null, error: body?.error || null });
    } catch (error) {
      results.push({ id: job.id, action, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return json(res, 200, { ok: true, scanned: jobs.length, results });
}
