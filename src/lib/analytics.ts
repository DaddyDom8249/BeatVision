import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    // BeatVision handles sensitive creative inputs (lyrics, prompts, titles, etc.).
    // Keep analytics event-driven rather than capturing arbitrary UI text/input.
    autocapture: false,
    persistence: "localStorage",
  });
  initialized = true;
}

export function identifyUser(userId: string | null | undefined) {
  if (!initialized || !userId) return;
  posthog.identify(userId);
}

export function capture(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function capturePageview(pathname: string) {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: window.location.href, pathname });
}
