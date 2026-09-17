export type DebugTraceLevel = 'info' | 'success' | 'warn' | 'error';

export interface DebugTraceEvent {
  id: string;
  at: string;
  level: DebugTraceLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

interface DebugTraceStore {
  version: 2;
  projectId: string;
  startedAt: string;
  updatedAt: string;
  events: DebugTraceEvent[];
}

const MAX_EVENTS = 2500;
const MAX_STRING = 4000;
const MAX_RESPONSE_BODY = 8000;
const keyFor = (projectId: string) => `beatvision-debug-trace:${projectId}`;

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MAX_DEPTH]';
  if (value instanceof Error) return {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[TRUNCATED]` : value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source).slice(0, 100)) {
      if (/authorization|token|secret|password|api[_-]?key|anon[_-]?key|service[_-]?role|cookie|set-cookie/i.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = safeValue(item, depth + 1);
      }
    }
    return output;
  }
  return value;
}

export function debugTraceRead(projectId: string): DebugTraceStore | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DebugTraceStore;
    if (!parsed || parsed.projectId !== projectId || !Array.isArray(parsed.events)) return null;
    return {
      version: parsed.version ?? 1,
      projectId,
      startedAt: parsed.startedAt,
      updatedAt: parsed.updatedAt,
      events: parsed.events.slice(-MAX_EVENTS),
    };
  } catch {
    return null;
  }
}

export function debugTraceEnsure(projectId: string): DebugTraceStore {
  const existing = debugTraceRead(projectId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created: DebugTraceStore = { version: 2, projectId, startedAt: now, updatedAt: now, events: [] };
  try { localStorage.setItem(keyFor(projectId), JSON.stringify(created)); } catch { /* diagnostics must never break the app */ }
  return created;
}

export function debugTraceLog(
  projectId: string,
  level: DebugTraceLevel,
  category: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const store = debugTraceEnsure(projectId);
  const event: DebugTraceEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    level,
    category,
    message,
    ...(details ? { details: safeValue(details) as Record<string, unknown> } : {}),
  };
  store.events = [...store.events, event].slice(-MAX_EVENTS);
  store.updatedAt = event.at;
  try { localStorage.setItem(keyFor(projectId), JSON.stringify(store)); } catch { /* ignore quota/storage failures */ }
  window.dispatchEvent(new CustomEvent('beatvision-debug-trace', { detail: { projectId, event } }));
}

export function debugTraceExport(projectId: string): string {
  return JSON.stringify(debugTraceRead(projectId) ?? debugTraceEnsure(projectId), null, 2);
}

export function debugTraceClear(projectId: string) {
  try { localStorage.removeItem(keyFor(projectId)); } catch { /* ignore */ }
}

export function debugTraceRedactUrl(input: string): string {
  try {
    const url = new URL(input, window.location.origin);
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`;
  } catch {
    return input.split(/[?#]/)[0];
  }
}

export function debugTraceHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = /authorization|token|secret|cookie|api[_-]?key/i.test(key) ? '[REDACTED]' : value.slice(0, 500);
  });
  return output;
}

export async function debugTraceResponseBody(response: Response): Promise<{ body?: unknown; truncated?: boolean }> {
  try {
    const text = await response.clone().text();
    if (!text) return {};
    const truncated = text.length > MAX_RESPONSE_BODY;
    const clipped = truncated ? `${text.slice(0, MAX_RESPONSE_BODY)}…[TRUNCATED]` : text;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      try { return { body: safeValue(JSON.parse(clipped)), truncated }; } catch { /* fall through to text */ }
    }
    return { body: clipped, truncated };
  } catch (error) {
    return { body: { captureError: error instanceof Error ? error.message : String(error) } };
  }
}
