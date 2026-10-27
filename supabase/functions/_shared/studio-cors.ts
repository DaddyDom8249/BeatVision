/**
 * CORS admission for BragoraForge Edge Functions.
 * Production origins remain hardcoded. Additional preview origins are explicitly
 * opted in by deploy owners through BEATVISION_ALLOWED_PREVIEW_ORIGINS.
 * Never accept a wildcard, hostname suffix match, client-supplied allowlist,
 * credentials, query strings, ports, paths or unknown Vercel accounts.
 */
export function trustedStudioOrigin(
  origin: string | null,
  productionOrigins: ReadonlySet<string>,
  previewConfig: string | null = null,
): string | null {
  if (!origin) return null;
  if (productionOrigins.has(origin)) return origin;
  const config = previewConfig || "";
  if (!config || config.length > 2048) return null;
  const candidates = config.split(",").map((value) => value.trim()).filter(Boolean);
  if (candidates.length > 8 || candidates.length === 0) return null;
  for (const candidate of candidates) {
    // Explicit exact preview hostname, belonging to the verified BeatVision
    // Vercel deployment namespace; no generic *.vercel.app trust.
    if (!/^https:\/\/beat-vision-[a-z0-9-]{6,140}-beat-vision\.vercel\.app$/.test(candidate))
      return null;
    try {
      const parsed = new URL(candidate);
      if (parsed.origin !== candidate || parsed.pathname !== "/" || parsed.search ||
          parsed.hash || parsed.username || parsed.password || parsed.port) return null;
    } catch { return null; }
  }
  return candidates.includes(origin) ? origin : null;
}
