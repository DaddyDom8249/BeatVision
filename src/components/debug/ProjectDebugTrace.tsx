import { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Download, Trash2, Pause, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/db/supabase';
import {
  debugTraceClear,
  debugTraceEnsure,
  debugTraceExport,
  debugTraceHeaders,
  debugTraceLog,
  debugTraceRead,
  debugTraceRedactUrl,
  debugTraceRequestBody,
  debugTraceResponseBody,
  debugTraceSetPaused,
  type DebugTraceEvent,
} from '@/lib/beatvision/debugTrace';

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/(?:project|projects)\/([0-9a-f-]{20,})/i);
  return match?.[1] ?? null;
}

export default function ProjectDebugTrace() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const projectId = useMemo(() => projectIdFromPath(pathname), [pathname]);
  const [events, setEvents] = useState<DebugTraceEvent[]>(() => projectId ? (debugTraceRead(projectId)?.events ?? []) : []);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const remoteQueueRef = useRef<DebugTraceEvent[]>([]);
  const flushingRef = useRef(false);
  const disposedRef = useRef(false);
  const pausedRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);
  const flushRemoteRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const onNavigation = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onNavigation);
    window.addEventListener('beatvision-route-change', onNavigation);
    return () => {
      window.removeEventListener('popstate', onNavigation);
      window.removeEventListener('beatvision-route-change', onNavigation);
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;

    disposedRef.current = false;
    pausedRef.current = false;
    debugTraceSetPaused(projectId, false);
    userIdRef.current = null;
    remoteQueueRef.current = [];
    flushingRef.current = false;

    const flushRemoteQueue = async () => {
      if (disposedRef.current || pausedRef.current || flushingRef.current || !userIdRef.current || remoteQueueRef.current.length === 0) return;
      flushingRef.current = true;
      try {
        while (!disposedRef.current && !pausedRef.current && userIdRef.current && remoteQueueRef.current.length) {
          const batch = remoteQueueRef.current.splice(0, 50);
          const rows = batch.map(event => ({
            project_id: projectId,
            user_id: userIdRef.current,
            event_at: event.at,
            level: event.level,
            category: event.category,
            message: event.message,
            details: event.details ?? {},
          }));
          const { error } = await supabase.from('project_debug_trace_events').insert(rows);
          if (error) {
            // Keep the failure visible locally. Do not enqueue this diagnostic again or
            // a broken remote sink could create an infinite diagnostic loop.
            debugTraceLog(projectId, 'warn', 'remotePersistence', 'Remote debug trace write failed', {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
              queuedEvents: batch.length,
            });
            remoteQueueRef.current = [...batch, ...remoteQueueRef.current].slice(-2500);
            break;
          }
        }
      } finally {
        flushingRef.current = false;
      }
    };

    const scheduleFlush = () => {
      if (pausedRef.current || disposedRef.current || flushTimerRef.current !== null) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flushRemoteQueue();
      }, 250);
    };
    flushRemoteRef.current = flushRemoteQueue;

    const onTrace = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; event: DebugTraceEvent }>).detail;
      if (detail?.projectId !== projectId || pausedRef.current) return;
      setEvents(debugTraceRead(projectId)?.events ?? []);
      if (detail.event.category !== 'remotePersistence') {
        remoteQueueRef.current.push(detail.event);
        scheduleFlush();
      }
    };

    void supabase.auth.getUser().then(({ data }) => {
      if (disposedRef.current) return;
      userIdRef.current = data.user?.id ?? null;
      void flushRemoteQueue();
    }).catch(error => {
      debugTraceLog(projectId, 'warn', 'auth', 'Unable to resolve current user for remote debug trace', { error });
    });

    debugTraceEnsure(projectId);
    setEvents(debugTraceRead(projectId)?.events ?? []);
    debugTraceLog(projectId, 'info', 'lifecycle', 'Project debug trace attached', { path: pathname });

    const onError = (event: ErrorEvent) => {
      debugTraceLog(projectId, 'error', 'browser', 'Unhandled browser error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      debugTraceLog(projectId, 'error', 'browser', 'Unhandled promise rejection', { reason: event.reason });
    };
    const onClick = (event: MouseEvent) => {
      if (paused) return;
      const target = event.target as HTMLElement | null;
      const control = target?.closest('button,[role="button"],a') as HTMLElement | null;
      if (!control) return;
      const text = (control.innerText || control.getAttribute('aria-label') || control.getAttribute('title') || '').trim().slice(0, 200);
      debugTraceLog(projectId, 'info', 'ui', 'User control activated', {
        tag: control.tagName,
        text,
        href: control instanceof HTMLAnchorElement ? debugTraceRedactUrl(control.href) : undefined,
      });
    };
    const onConsoleError = (...args: unknown[]) => debugTraceLog(projectId, 'error', 'console', 'console.error', { args });
    const onConsoleWarn = (...args: unknown[]) => debugTraceLog(projectId, 'warn', 'console', 'console.warn', { args });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const request = input instanceof Request ? input : null;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || request?.method || 'GET';
      const requestHeaders = new Headers(request?.headers);
      if (init?.headers) {
        const extraHeaders = new Headers(init.headers);
        extraHeaders.forEach((value, key) => requestHeaders.set(key, value));
      }
      const traceId = crypto.randomUUID();
      const requestBody = init?.body ?? null;
      const requestContentType = requestHeaders.get('content-type');

      try {
        const response = await originalFetch(input, init);
        const durationMs = Math.round(performance.now() - started);
        const details: Record<string, unknown> = {
          traceId,
          method,
          url: debugTraceRedactUrl(url),
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          durationMs,
          responseContentType: response.headers.get('content-type'),
          responseRequestId: response.headers.get('x-request-id') || response.headers.get('x-supabase-request-id'),
        };
        if (!response.ok) {
          details.requestHeaders = debugTraceHeaders(requestHeaders);
          const requestCapture = await debugTraceRequestBody(requestBody, requestContentType);
          if (requestCapture.body !== undefined) details.requestBody = requestCapture.body;
          if (requestCapture.kind) details.requestBodyKind = requestCapture.kind;
          details.requestBodyTruncated = requestCapture.truncated ?? false;
          const captured = await debugTraceResponseBody(response);
          details.responseBody = captured.body;
          details.responseBodyTruncated = captured.truncated ?? false;
          debugTraceLog(projectId, 'error', 'network', 'Fetch failed with HTTP error', details);
        } else {
          debugTraceLog(projectId, 'info', 'network', 'Fetch completed', details);
        }
        return response;
      } catch (error) {
        debugTraceLog(projectId, 'error', 'network', 'Fetch failed before HTTP response', {
          traceId,
          method,
          url: debugTraceRedactUrl(url),
          durationMs: Math.round(performance.now() - started),
          requestHeaders: debugTraceHeaders(requestHeaders),
          requestBody: (await debugTraceRequestBody(requestBody, requestContentType)).body,
          error,
        });
        throw error;
      }
    };

    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args: unknown[]) => { originalConsoleError(...args); onConsoleError(...args); };
    console.warn = (...args: unknown[]) => { originalConsoleWarn(...args); onConsoleWarn(...args); };

    window.addEventListener('beatvision-debug-trace', onTrace);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('click', onClick, true);

    return () => {
      disposedRef.current = true;
      pausedRef.current = false;
      debugTraceSetPaused(projectId, false);
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushRemoteRef.current = null;
      window.fetch = originalFetch;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      window.removeEventListener('beatvision-debug-trace', onTrace);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('click', onClick, true);
    };
  }, [projectId, pathname]);

  if (!projectId) return null;
  const trace = debugTraceRead(projectId);

  const download = () => {
    const blob = new Blob([debugTraceExport(projectId)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beatvision-debug-${projectId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    debugTraceLog(projectId, 'success', 'debug', 'Debug report exported');
  };

  const clear = () => {
    debugTraceClear(projectId);
    debugTraceEnsure(projectId);
    setEvents([]);
    debugTraceLog(projectId, 'info', 'debug', 'Debug trace cleared');
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[min(92vw,430px)] text-white">
      <div className="rounded-xl border border-red-400/30 bg-black/90 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
          <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-semibold">
            <Bug className="h-4 w-4 text-red-400" />
            Debug Trace
            <Badge className="bg-red-500/15 text-red-300 border-red-400/20">{events.length}</Badge>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70" onClick={() => {
              const next = !pausedRef.current;
              pausedRef.current = next;
              debugTraceSetPaused(projectId, next);
              setPaused(next);
              if (!next) void flushRemoteRef.current?.();
            }} title={paused ? 'Resume trace' : 'Pause trace'}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70" onClick={download} title="Export debug report">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70" onClick={clear} title="Clear debug trace">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {open && (
          <div className="max-h-80 overflow-auto p-2 space-y-1 text-[11px] font-mono">
            {trace?.events.length ? trace.events.slice(-100).map(event => (
              <div key={event.id} className="rounded bg-white/5 px-2 py-1">
                <div className="flex gap-2 text-white/50"><span>{new Date(event.at).toLocaleTimeString()}</span><span>[{event.level}]</span><span>{event.category}</span></div>
                <div className="text-white/90">{event.message}</div>
                {event.details && <pre className="mt-1 whitespace-pre-wrap break-words text-white/45">{JSON.stringify(event.details)}</pre>}
              </div>
            )) : <div className="p-4 text-center text-white/40">No events yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
