const CONTRACT = '1.1';

function cors(r: Request) {
  return {
    'Access-Control-Allow-Origin': r.headers.get('Origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-beatvision-request',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  };
}
function json(r: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json', ...cors(r) } });
}
function rid(r: Request, supplied?: unknown) { return String(supplied || r.headers.get('X-BeatVision-Request') || crypto.randomUUID()); }
function b64(bytes: Uint8Array) { let out=''; for(let i=0;i<bytes.length;i+=0x8000) out += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(out); }
async function addAudio(payload: Record<string, unknown>) {
  if (typeof payload.audio_base64 === 'string' && payload.audio_base64) return payload;
  const url = typeof payload.audio_url === 'string' ? payload.audio_url : '';
  if (!url) return payload;
  if (!/^https?:\/\//i.test(url)) throw new Error('audio_url must be HTTPS.');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Unable to read project audio: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('Project audio exceeds 25 MB.');
  return { ...payload, audio_base64: b64(bytes) };
}

export default {
  async fetch(r: Request, env: Record<string,string>) {
    if (r.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(r) });
    const gateway = String(env.ARENA_GATEWAY_URL || '').trim().replace(/\/$/, '');
    const token = String(env.ARENA_GATEWAY_TOKEN || '').trim();
    if (!gateway || !token) return json(r, { ok:false, status:'provider_unavailable', error:'BeatVision Arena gateway is not configured.' }, 503);

    let input: any = {};
    if (r.method === 'POST') { try { input = await r.json(); } catch { return json(r,{ok:false,error:'Invalid JSON.'},400); } }
    const requestId = rid(r, input.request_id);
    const path = String(input.path || '/');
    if (r.method === 'GET' && !/^\/health$|^\/v1\/capabilities$|^\/v1\/video\/animate\/jobs\/[A-Za-z0-9._:-]+$/.test(path)) return json(r,{ok:false,error:'Unsupported Arena GET path.'},400);
    if (r.method === 'POST' && input.contract_version !== CONTRACT) return json(r,{ok:false,error:`Expected contract ${CONTRACT}.`,request_id:requestId},400);

    let body: string | undefined;
    if (r.method === 'POST') {
      const payload = input.operation === 'assemble' ? await addAudio(input.payload || {}) : (input.payload || {});
      body = JSON.stringify({ contract_version: CONTRACT, operation: input.operation, payload, request_id: requestId });
    }

    try {
      const upstream = await fetch(`${gateway}${path.startsWith('/') ? path : `/${path}`}`, {
        method: r.method,
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, 'X-BeatVision-Contract':CONTRACT, 'X-BeatVision-Request':requestId },
        body,
      });
      const text = await upstream.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { ok:false, error:text.slice(0,4000) }; }
      if (data && typeof data === 'object' && !data.request_id) data.request_id = requestId;
      return json(r, data, upstream.status);
    } catch (error) {
      return json(r,{ok:false,contract_version:CONTRACT,provider:'beatvision-arena',status:'provider_error',request_id:requestId,error:error instanceof Error?error.message:String(error)},502);
    }
  }
};
