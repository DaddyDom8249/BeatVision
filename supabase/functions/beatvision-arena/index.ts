const CONTRACT = '1.1';

function cors(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-beatvision-request',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(request) },
  });
}

function requestId(request: Request, supplied?: unknown) {
  return String(supplied || request.headers.get('X-BeatVision-Request') || crypto.randomUUID());
}

function base64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function hydrateAudio(payload: Record<string, unknown>) {
  if (typeof payload.audio_base64 === 'string' && payload.audio_base64) return payload;
  const audioUrl = typeof payload.audio_url === 'string' ? payload.audio_url : '';
  if (!audioUrl) return payload;
  if (!/^https?:\/\//i.test(audioUrl)) throw new Error('audio_url must be an https URL.');
  const response = await fetch(audioUrl, { headers: { 'User-Agent': 'BeatVision-Arena-Bridge/1.0' } });
  if (!response.ok) throw new Error(`Unable to read project audio (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Project audio exceeds the 25 MB Arena bridge limit.');
  return { ...payload, audio_base64: base64(bytes) };
}

export default {
  async fetch(request: Request, env: Record<string, string>) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    // Supabase Edge Functions validate the caller JWT before entering this function.
    // Never accept an Arena credential from browser input.
    const arenaUrl = String(env.ARENA_GATEWAY_URL || '').trim().replace(/\/$/, '');
    const arenaToken = String(env.ARENA_GATEWAY_TOKEN || '').trim();
    if (!arenaUrl || !arenaToken) return json(request, { ok: false, status: 'provider_unavailable', error: 'BeatVision Arena gateway is not configured.' }, 503);

    let input: any = {};
    if (request.method === 'POST') {
      try { input = await request.json(); }
      catch { return json(request, { ok: false, error: 'Invalid JSON body.' }, 400); }
    }

    const id = requestId(request, input?.request_id);
    const path = String(input?.path || '/');
    const operation = String(input?.operation || '');
    const target = `${arenaUrl}${path.startsWith('/') ? path : `/${path}`}`;

    if (request.method === 'GET') {
      if (!/^\/health$|^\/v1\/capabilities$|^\/v1\/video\/animate\/jobs\/[A-Za-z0-9._:-]+$/.test(path)) return json(request, { ok: false, error: 'Unsupported Arena GET path.' }, 400);
    } else if (request.method !== 'POST') {
      return json(request, { ok: false, error: 'POST or GET required.' }, 405);
    }

    try {
      let body: string | undefined;
      if (request.method === 'POST') {
        if (input.contract_version !== CONTRACT) return json(request, { ok: false, error: `Expected BeatVision contract ${CONTRACT}.`, request_id: id }, 400);
        const payload = operation === 'assemble' ? await hydrateAudio(input.payload || {}) : (input.payload || {});
        body = JSON.stringify({ contract_version: CONTRACT, operation, payload, request_id: id, job_id: input.job_id });
      }

      const response = await fetch(target, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${arenaToken}`,
          'X-BeatVision-Contract': CONTRACT,
          'X-BeatVision-Request': id,
        },
        body,
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 4000) }; }
      if (data && typeof data === 'object' && !data.request_id) data.request_id = id;
      return json(request, data, response.status);
    } catch (error) {
      return json(request, {
        ok: false,
        contract_version: CONTRACT,
        status: 'provider_error',
        provider: 'beatvision-arena',
        request_id: id,
        error: error instanceof Error ? error.message : String(error),
      }, 502);
    }
  },
};
