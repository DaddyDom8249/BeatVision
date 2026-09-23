export class BeatVisionAuthError extends Error {
  status = 401;
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "BeatVisionAuthError";
  }
}

function env(name: string): string {
  return String(Deno.env.get(name) || "").trim();
}

function bearerToken(request: Request): string {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new BeatVisionAuthError();
  return match[1].trim();
}

function supabaseBaseUrl(): string {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  if (!/^https:\/\//i.test(url)) throw new Error("Supabase URL is not configured.");
  return url;
}

function supabaseAnonKey(): string {
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("Supabase publishable key is not configured.");
  return key;
}

export async function requireAuthenticatedUser(request: Request): Promise<{ id: string }> {
  const token = bearerToken(request);
  const response = await fetch(`${supabaseBaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new BeatVisionAuthError("Invalid or expired authentication session.");
  }

  const user = await response.json().catch(() => null);
  if (!user || typeof user.id !== "string" || !user.id) {
    throw new BeatVisionAuthError("Authenticated user could not be established.");
  }

  return { id: user.id };
}

export async function assertProjectOwner(
  request: Request,
  projectId: unknown,
  userId: string,
): Promise<void> {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("project_id is required.");

  const response = await fetch(
    `${supabaseBaseUrl()}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      headers: {
        apikey: supabaseAnonKey(),
        Authorization: `Bearer ${bearerToken(request)}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Project authorization check failed.");
  }

  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length !== 1) {
    const error = new Error("Project access denied.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
