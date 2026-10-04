import { BeatVisionAuthError, requireAuthenticatedUser } from "./_shared/auth.ts";

const CONTRACT = "1.1";

const JOB_PATH = /^\/v1\/video\/animate\/jobs\/[A-Za-z0-9._:-]+$/;
const ASSEMBLY_STATUS_PATH = /^\/v1\/video\/assemble\/status\/[A-Za-z0-9-]+$/;

const ALLOWED_POST_PATHS = [
  "/v2/scene-image",
  "/v2/animate",
  "/v2/assemble",
  "/v1/image/scenes",
  "/v1/video/animate",
  "/v1/video/assemble",
  "/v1/capabilities",
  "/v1/language/generate",
];

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function allowedOrigins(): string[] {
  return env("BEATVISION_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const configured = allowedOrigins();
  const productionOrigins = [
    "https://daddydom8249.github.io",
    "https://beat-vision-theta.vercel.app",
    "http://localhost:5173",
  ];
  const isBeatVisionVercelPreview =
    /^https:\/\/beat-vision-[a-z0-9-]+-beat-vision\.vercel\.app$/i.test(origin);
  const allowed = configured.length === 0
    ? productionOrigins.includes(origin) || isBeatVisionVercelPreview
    : configured.includes(origin) || productionOrigins.includes(origin) || isBeatVisionVercelPreview;

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-beatvision-request, traceparent, tracestate, baggage, x-retry-count",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };

  if (origin && allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin) {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

function json(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-BeatVision-Phase": status >= 500 ? "error" : "completed",
      ...cors(request),
    },
  });
}

function requestId(request: Request, supplied?: unknown): string {
  return String(
    supplied ||
      request.headers.get("X-BeatVision-Request") ||
      crypto.randomUUID(),
  );
}

async function assertProjectAccess(
  request: Request,
  projectId: unknown,
  userId: string,
): Promise<void> {
  if (!projectId) return;

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") || "";

  if (
    !supabaseUrl ||
    !anonKey ||
    !/^Bearer\s+\S+$/i.test(authorization)
  ) {
    throw new Error(
      "Authenticated project access could not be established.",
    );
  }

  const url =
    `${supabaseUrl}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(
      String(projectId),
    )}&owner_id=eq.${encodeURIComponent(userId)}&limit=1`;

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: authorization,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Project authorization check failed.");
  }

  const rows = await response.json().catch(() => []);

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Project access denied.");
  }
}

function validPath(path: string, method: string): boolean {
  if (method === "GET") {
    return (
      /^\/health$|^\/v1\/capabilities$|^\/v1\/video\/animate\/jobs\/[A-Za-z0-9._:-]+$/.test(
        path,
      )
    );
  }

  return ALLOWED_POST_PATHS.includes(path) || JOB_PATH.test(path) || ASSEMBLY_STATUS_PATH.test(path);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors(request),
    });
  }

  let authenticatedUserId = "";
  try {
    const authResult = await requireAuthenticatedUser(request);
    authenticatedUserId = authResult.id;
  } catch (error) {
    const status = error instanceof BeatVisionAuthError ? 401 : 500;
    return json(request, { ok: false, error: error instanceof Error ? error.message : "Authentication failed." }, status);
  }

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") || "";

  // Rate-limit authenticated Arena bridge calls before provider work begins.
  // The database function is atomic, so concurrent requests cannot bypass the
  // per-user window by racing an in-memory counter.
  const rateLimitResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/consume_beatvision_arena_rate_limit`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  if (!rateLimitResponse.ok) {
    return json(
      request,
      {
        ok: false,
        error: "Arena rate limiter is unavailable; refusing provider work.",
      },
      503,
    );
  }

  const rateLimitResult = await rateLimitResponse.json().catch(() => false);
  const rateLimitAllowed =
    rateLimitResult === true ||
    (Array.isArray(rateLimitResult) && rateLimitResult[0] === true);

  if (!rateLimitAllowed) {
    return json(
      request,
      {
        ok: false,
        error: "Arena request rate limit exceeded. Try again after the current window.",
      },
      429,
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) {
    return json(request, { ok: false, error: "Request body is too large." }, 413);
  }

  const arenaUrl = env("ARENA_GATEWAY_URL").replace(/\/$/, "");
  const arenaToken = env("ARENA_GATEWAY_TOKEN");

  if (!arenaUrl || !arenaToken) {
    return json(
      request,
      {
        ok: false,
        status: "provider_unavailable",
        error: "BeatVision Arena gateway is not configured.",
      },
      503,
    );
  }

  let input: Record<string, unknown> = {};

  if (request.method === "POST") {
    try {
      const parsed = await request.json();

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return json(
          request,
          {
            ok: false,
            error: "JSON body must be an object.",
          },
          400,
        );
      }

      input = parsed as Record<string, unknown>;
    } catch {
      return json(
        request,
        {
          ok: false,
          error: "Invalid JSON body.",
        },
        400,
      );
    }
  }

  const id = requestId(request, input.request_id);
  const path = String(input.path || "/");
  const operation = String(input.operation || "");
  const isJobPath = JOB_PATH.test(path);

  if (request.method === "GET") {
    if (!validPath(path, request.method)) {
      return json(
        request,
        {
          ok: false,
          error: "Unsupported Arena GET path.",
        },
        400,
      );
    }
  } else if (request.method !== "POST") {
    return json(
      request,
      {
        ok: false,
        error: "POST or GET required.",
      },
      405,
    );
  } else if (!validPath(path, request.method)) {
    return json(
      request,
      {
        ok: false,
        error: "Unsupported Arena POST path.",
      },
      400,
    );
  }

  let phase = "validated";
  try {
    let body: string | undefined;

    if (request.method === "POST") {
      if (input.contract_version !== CONTRACT) {
        return json(
          request,
          {
            ok: false,
            error: `Expected BeatVision contract ${CONTRACT}.`,
            request_id: id,
          },
          400,
        );
      }

      const payload =
        input.payload &&
        typeof input.payload === "object" &&
        !Array.isArray(input.payload)
          ? (input.payload as Record<string, unknown>)
          : {};

      phase = "project_access";
      await assertProjectAccess(request, payload.project_id, authenticatedUserId);
      phase = "project_access_ok";

      if (operation === "animationJob" && isJobPath) {
        body = JSON.stringify({
          ...payload,
          contract_version: CONTRACT,
          request_id: id,
          job_id: input.job_id || path.split("/").pop(),
        });
      } else {
        if (
          operation === "assemble" &&
          typeof payload.audio_base64 === "string" &&
          payload.audio_base64.length > 0
        ) {
          return json(
            request,
            {
              ok: false,
              contract_version: CONTRACT,
              request_id: id,
              error: "Final assembly requires audio_url. Do not send audio_base64 through the Edge Function; the Arena Worker can fetch the HTTPS audio URL directly.",
            },
            400,
          );
        }

        if (
          operation === "assemble" &&
          payload.audio_url != null &&
          (typeof payload.audio_url !== "string" || !/^https:\/\//i.test(payload.audio_url))
        ) {
          return json(
            request,
            {
              ok: false,
              contract_version: CONTRACT,
              request_id: id,
              error: "audio_url must be an HTTPS URL for final assembly.",
            },
            400,
          );
        }

        body = JSON.stringify({
          contract_version: CONTRACT,
          operation,
          payload,
          request_id: id,
          job_id: input.job_id,
        });
      }
    }

    const target =
      `${arenaUrl}${path.startsWith("/") ? path : `/${path}`}`;

    phase = "arena_request";
    console.log(JSON.stringify({ event: "arena_bridge_request", request_id: id, operation, path, target_host: (() => { try { return new URL(target).host; } catch { return "invalid-url"; } })() }));

    const response = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${arenaToken}`,
        "X-BeatVision-Contract": CONTRACT,
        "X-BeatVision-Request": id,
      },
      body,
    });

    phase = "arena_response";
    const text = await response.text();

    console.log(JSON.stringify({ event: "arena_bridge_response", request_id: id, operation, path, upstream_status: response.status, upstream_ok: response.ok, response_bytes: text.length }));

    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: text.slice(0, 1200),
      };
    }

    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      !("request_id" in data)
    ) {
      (data as Record<string, unknown>).request_id = id;
    }

    return json(request, data, response.status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    const status = /access denied|authorization check/i.test(message)
      ? 403
      : 502;

    return json(
      request,
      {
        ok: false,
        contract_version: CONTRACT,
        status:
          status === 403
            ? "project_access_denied"
            : "provider_error",
        provider: "beatvision-arena",
        request_id: id,
        phase,
        error: message.slice(0, 500),
      },
      status,
    );
  }
});
