const SHA_RE = /^[a-f0-9]{40}$/i;
const MAX_OBSERVATION_AGE_MS = 72 * 60 * 60 * 1000;

export function evaluateGate({ pr, reviewThreads, production, comparison, now = new Date(), files = [] }) {
  const blockers = [];
  const headSha = pr?.head?.sha;
  const productionSha = production?.commit_sha;
  if (!SHA_RE.test(headSha || "")) blockers.push("PR HEAD SHA was not verified.");
  if (!SHA_RE.test(productionSha || "")) blockers.push("Production source SHA is unknown.");
  if (pr?.state !== "open") blockers.push("PR is not open.");
  if (pr?.draft) blockers.push("PR is a draft.");
  if (pr?.mergeable === false) blockers.push("GitHub reports merge conflicts.");
  if (!Array.isArray(reviewThreads)) blockers.push("Review thread inspection is unavailable.");
  const unresolved = Array.isArray(reviewThreads)
    ? reviewThreads.filter((thread) => thread.isResolved !== true && thread.isOutdated !== true)
    : [];
  if (unresolved.length) blockers.push(String(unresolved.length) + " unresolved current review thread(s).");
  const observedMs = Date.parse(production?.observed_at || "");
  const nowMs = new Date(now).getTime();
  const ageMs = nowMs - observedMs;
  if (!Number.isFinite(ageMs) || !Number.isFinite(nowMs) || ageMs < 0 || ageMs > MAX_OBSERVATION_AGE_MS)
    blockers.push("Production SHA observation is missing, future-dated, or older than 72 hours.");
  if (!comparison || !["ahead", "identical"].includes(comparison.status) || comparison.behind_by !== 0)
    blockers.push("PR HEAD does not prove preservation of every production-source commit.");
  const changedFiles = Array.isArray(files) ? files.map((file) => file.filename).filter(Boolean) : [];
  return {
    status: blockers.length ? "BLOCKED_FOR_RELEASE" : "PREFLIGHT_PASS_NOT_RELEASE_APPROVAL",
    release_authorized: false,
    head_sha: headSha || null,
    base_sha: pr?.base?.sha || null,
    production_sha: productionSha || null,
    production_observed_at: production?.observed_at || null,
    comparison_status: comparison?.status || "UNKNOWN",
    comparison_behind_by: comparison?.behind_by ?? null,
    changed_file_count: changedFiles.length,
    changed_files: changedFiles,
    unresolved_review_count: unresolved.length,
    blockers,
    unverified: [
      "Exact-head test, audit and build results must be checked separately.",
      "Production alias, live authentication, mobile workflow and media output remain unverified.",
      "No PR merge, deployment, approval, generation or production database write is authorized by this report."
    ]
  };
}
export function reportMarkdown(report, prNumber) {
  const lines = [
    "## BeatVision PR preflight", "",
    "**PR:** #" + prNumber,
    "**Status:** " + report.status,
    "**PR HEAD:** " + (report.head_sha || "UNKNOWN"),
    "**Base SHA:** " + (report.base_sha || "UNKNOWN"),
    "**Observed production SHA:** " + (report.production_sha || "UNKNOWN"),
    "**Production observation:** " + (report.production_observed_at || "UNKNOWN"),
    "**Lineage comparison:** " + report.comparison_status + ", behind=" + report.comparison_behind_by,
    "**Changed files:** " + report.changed_file_count,
    "**Unresolved review threads:** " + report.unresolved_review_count,
    "", "### Release blockers"
  ];
  if (!report.blockers.length) lines.push("- None found in this preflight. This is not deployment approval.");
  for (const item of report.blockers) lines.push("- " + item);
  lines.push("", "### Still unverified");
  for (const item of report.unverified) lines.push("- " + item);
  return lines.join("\n") + "\n";
}
