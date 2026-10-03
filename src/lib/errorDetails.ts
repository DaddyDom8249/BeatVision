type ErrorLike = { message?: string; code?: string; details?: string; hint?: string; status?: number };

export function formatFailure(operation: string, error: unknown, context?: Record<string, unknown>): string {
  const e = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const message = error instanceof Error ? error.message : e.message || String(error || "Unknown error");
  const parts = [operation + " failed: " + message];
  if (e.code) parts.push("Code: " + e.code);
  if (e.status) parts.push("HTTP status: " + e.status);
  if (e.details) parts.push("Details: " + e.details);
  if (e.hint) parts.push("Hint: " + e.hint);
  if (context) {
    const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (entries.length) parts.push("Context: " + entries.map(([key, value]) => key + "=" + String(value)).join(", "));
  }
  return parts.join(" | ");
}

export function formatHttpFailure(operation: string, response: Response, body: string): string {
  let payload: any = null;
  try { payload = body ? JSON.parse(body) : null; } catch { /* non-JSON response */ }
  const serverMessage = payload?.error?.message || payload?.message || payload?.error || body.trim();
  const parts = [operation + " failed", "HTTP " + response.status + (response.statusText ? " " + response.statusText : "")];
  if (serverMessage) parts.push("Server: " + String(serverMessage).slice(0, 1000));
  if (payload?.error?.code || payload?.code) parts.push("Code: " + (payload.error?.code || payload.code));
  if (payload?.error?.details || payload?.details) parts.push("Details: " + (payload.error?.details || payload.details));
  if (payload?.error?.hint || payload?.hint) parts.push("Hint: " + (payload.error?.hint || payload.hint));
  return parts.join(" | ");
}