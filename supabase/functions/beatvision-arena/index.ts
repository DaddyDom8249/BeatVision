import { BeatVisionAuthError, requireAuthenticatedUser } from "../_shared/auth.ts";

const CONTRACT = "1.1";

const JOB_PATH = /^\/v1\/video\/animate\/jobs\/[A-Za-z0-9._:-]+$/;

const ALLOWED_POST_PATHS = [
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
  const allowed = configured.length === 0
    ? productionOrigins.includes(origin)
    : configured.includes(origin) || productionOrigins.includes(origin);

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

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary);
}

async function hydrateAudio(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (typeof payload.audio_base64 === "string" && payload.audio_base64) {
    return payload;
  }

  const audioUrl =
    typeof payload.audio_url === "string" ? payload.audio_url : "";

  if (!audioUrl) return payload;

  if (!/^https?:\/\//i.test(audioUrl)) {
    throw new Error("audio_url must be an https URL.");
  }

  const response = await fetch(audioUrl, {
    headers: {
      "User-Agent": "BeatVision-Arena-Bridge/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Unable to read project audio (${response.status}).`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error(
      "Project audio exceeds the 25 MB Arena bridge limit.",
    );
  }

  return {
    ...payload,
    audio_base64: base64(bytes),
  };
}

async function assertProjectAccess(
  request: Request,
  projectId: unknown,
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
    )}&limit=1`;

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

  return ALLOWED_POST_PATHS.includes(path) || JOB_PATH.test(path);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors(request),
    });
  }

  try {
    await requireAuthenticatedUser(request);
  } catch (error) {
    const status = error instanceof BeatVisionAuthError ? 401 : 500;
    return json(request, { ok: false, error: error instanceof Error ? error.message : "Authentication failed." }, status);
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
      await assertProjectAccess(request, payload.project_id);
      phase = "project_access_ok";

      if (operation === "animationJob" && isJobPath) {
        body = JSON.stringify({
          ...payload,
          contract_version: CONTRACT,
          request_id: id,
          job_id: input.job_id || path.split("/").pop(),
        });
      } else {
        const hydrated =
          operation === "assemble"
            ? await hydrateAudio(payload)
            : payload;

        body = JSON.stringify({
          contract_version: CONTRACT,
          operation,
          payload: hydrated,
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
