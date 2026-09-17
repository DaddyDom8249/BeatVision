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
  version: 1;
  projectId: string;
  startedAt: string;
  updatedAt: string;
  events: DebugTraceEvent[];
}

const MAX_EVENTS = 2500;
const keyFor = (projectId: string) => `beatvision-debug-trace:${projectId}`;

function safeValue(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(safeValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (/authorization|token|secret|password|api[_-]?key|anon[_-]?key|service[_-]?role/i.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = safeValue(item);
      }
    }
    return output;
  }
  return value;
}

export function debugTraceRead(projectId: string): DebugTraceStore | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    return raw ? JSON.parse(raw) as DebugTraceStore : null;
  } catch {
    return null;
  }
}

export function debugTraceEnsure(projectId: string): DebugTraceStore {
  const existing = debugTraceRead(projectId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created: DebugTraceStore = { version: 1, projectId, startedAt: now, updatedAt: now, events: [] };
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
