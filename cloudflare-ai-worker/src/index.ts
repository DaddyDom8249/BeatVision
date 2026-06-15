interface Env {
  AI: any;
}

const ALLOWED_ORIGINS = new Set([
  "https://beat-vision.vercel.app",
  "https://beat-vision-theta.vercel.app",
  "http://localhost:5173"
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data: unknown, status = 200, request: Request) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request)
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        name: "BeatVision Cloudflare AI Worker",
        routes: ["/generate-image"],
        model: "@cf/stabilityai/stable-diffusion-xl-base-1.0"
      }, 200, request);
    }

    if (url.pathname === "/generate-image" && request.method === "POST") {
      let body: any = {};

      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON body." }, 400, request);
      }

      const prompt = String(body.prompt || "").trim();
      if (!prompt) {
        return json({ ok: false, error: "Missing prompt." }, 400, request);
      }

      const negative_prompt = String(
        body.negative_prompt ||
        "blurry, low quality, distorted, watermark, text, logo, extra fingers, bad anatomy"
      );

      const width = Number(body.width || 1024);
      const height = Number(body.height || 1024);
      const num_steps = Number(body.num_steps || 20);
      const guidance = Number(body.guidance || 7.5);

      try {
        const imageStream = await env.AI.run(
          "@cf/stabilityai/stable-diffusion-xl-base-1.0",
          {
            prompt,
            negative_prompt,
            width,
            height,
            num_steps,
            guidance
          }
        );

        return new Response(imageStream, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            ...corsHeaders(request)
          }
        });
      } catch (err: any) {
        return json({
          ok: false,
          error: "Cloudflare image generation failed.",
          details: String(err?.message || err)
        }, 500, request);
      }
    }

    return json({ ok: false, error: "Route not found." }, 404, request);
  }
};
