# BeatVision PR automation preflight

This automation is **read-only** and fail-closed. It creates no branches, merges, deployments, media jobs, approval changes, database writes or paid API calls. It operates separately from source repair.

## When it runs

`.github/workflows/pr-automation-preflight.yml` triggers when a PR is opened, reopened, receives new commits, or becomes ready for review. A workflow-dispatch input `pr_number` checks an existing PR without changing it. The workflow needs only `contents: read` and `pull-requests: read`.

## What it checks

* The actual PR HEAD and base SHAs, repository identity, changed files and pagination.
* Unresolved, non-outdated GitHub inline review threads; missing permissions/errors BLOCK.
* Whether the PR HEAD contains all commits from the last **observed** live production source, using the GitHub compare API.
* Whether the observed production commit is fresh (72-hour maximum) and recorded with its source.
* Draft and merge-conflict status.
* A factual Job Summary with `BLOCKED_FOR_RELEASE` or `PREFLIGHT_PASS_NOT_RELEASE_APPROVAL`.

**A preflight pass never authorizes deployment or proves full production behavior.** CI test/build status must be reviewed separately, and authenticated Android/live integration remains unverified.

## Updating the production source evidence

`.github/automation/production-source.json` is a snapshot, not a continuously verified Vercel API result. To refresh it, first inspect the real production alias using the connected Vercel deployment tool, verify its commit SHA, and only then record that SHA and current `observed_at`. Never extend the timestamp without checking live production. If the observation is stale, the check intentionally fails.

No Vercel credentials are passed to this GitHub workflow, and no API tokens or provider secrets are stored in this file.

## Test coverage and evidence reporting

`.github/workflows/production-ci.yml` runs existing `npm test` plus the nested integration tests omitted by the current package script, followed by the production audit and build. Coordinate with existing PR #77, which separately addresses npm test discovery, before adopting both changes.

Run focused tests with `node --test scripts/test/automation-*.test.mjs`. Use `node scripts/automation/evidence-report.mjs report.json` to format a factual report from JSON. Its `--append` mode requires an explicitly identified repair branch, and never commits, pushes, merges or deploys.

Do not enable unattended Skyvern production automation or Jules retries here. The existing authorized Jules session must be reused if safely available; the GitHub workflow cannot invoke it. Browser and provider usage need verified zero-cost permissions and a trusted authenticated session.

## Release policy

This workflow enforces a **negative release gate**. It cannot grant positive authority to merge or deploy; approval, CI at the exact SHA, environment-specific validation, and real workflow verification remain separate required gates.
