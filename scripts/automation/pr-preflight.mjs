import fs from "node:fs";
import { evaluateGate, reportMarkdown } from "./review-gate-core.mjs";
const repo = process.env.GITHUB_REPOSITORY || "";
const token = process.env.GITHUB_TOKEN || "";
const eventPath = process.env.GITHUB_EVENT_PATH || "";
const event = eventPath ? JSON.parse(fs.readFileSync(eventPath, "utf8")) : {};
const prNumber = Number(event.pull_request?.number || process.env.INPUT_PR_NUMBER || 0);
function appendSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error("GitHub API " + response.status + " at " + new URL(url).pathname);
  return response.json();
}
async function allFiles(owner, name, number) {
  const files = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api("https://api.github.com/repos/" + owner + "/" + name + "/pulls/" + number + "/files?per_page=100&page=" + page);
    if (!Array.isArray(batch)) throw new Error("Invalid PR file listing.");
    files.push(...batch);
    if (batch.length < 100) return files;
  }
  throw new Error("PR exceeds the 2000-file preflight inspection limit.");
}
async function allReviewThreads(owner, name, number) {
  const threads = [];
  let after = null;
  for (let page = 0; page < 30; page++) {
    const result = await api("https://api.github.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated}}}}}",
        variables: { owner, name, number, after }
      })
    });
    if (result.errors?.length) throw new Error("Review thread query failed: " + result.errors.map((e) => e.message).join("; "));
    const connection = result.data?.repository?.pullRequest?.reviewThreads;
    if (!connection || !Array.isArray(connection.nodes)) throw new Error("Review threads could not be read.");
    threads.push(...connection.nodes);
    if (!connection.pageInfo?.hasNextPage) return threads;
    if (!connection.pageInfo?.endCursor) throw new Error("Missing review thread pagination cursor.");
    after = connection.pageInfo.endCursor;
  }
  throw new Error("Review threads exceed preflight pagination limit.");
}
async function main() {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || !token || !Number.isInteger(prNumber) || prNumber <= 0)
    throw new Error("A GitHub repository, read-only token and valid PR number are required.");
  const [owner, name] = repo.split("/");
  const root = "https://api.github.com/repos/" + owner + "/" + name;
  const production = JSON.parse(fs.readFileSync(new URL("../../.github/automation/production-source.json", import.meta.url), "utf8"));
  const [pr, files, threads] = await Promise.all([
    api(root + "/pulls/" + prNumber),
    allFiles(owner, name, prNumber),
    allReviewThreads(owner, name, prNumber)
  ]);
  if (pr.number !== prNumber || pr.base?.repo?.full_name !== repo || pr.head?.repo?.full_name !== repo)
    throw new Error("PR repository identity mismatch or unsupported cross-repository head.");
  let comparison = null;
  if (/^[a-f0-9]{40}$/i.test(production.commit_sha || "") && /^[a-f0-9]{40}$/i.test(pr.head?.sha || ""))
    comparison = await api(root + "/compare/" + production.commit_sha + "..." + pr.head.sha);
  const report = evaluateGate({ pr, reviewThreads: threads, production, comparison, files });
  const markdown = reportMarkdown(report, prNumber);
  console.log(markdown);
  appendSummary(markdown);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "release_gate=" + report.status + "\n");
  if (report.blockers.length) process.exitCode = 1;
}
main().catch((error) => {
  const message = "PR preflight FAILED CLOSED: " + (error instanceof Error ? error.message : String(error));
  console.error(message);
  appendSummary("## BeatVision PR preflight\n\n**BLOCKED:** " + message + "\n");
  process.exitCode = 1;
});
