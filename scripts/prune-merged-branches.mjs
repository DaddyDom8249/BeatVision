// One-time, fail-closed GitHub Actions cleanup for *merged* BeatVision branches.
// Never use this script with a user PAT. GitHub Actions supplies a scoped token.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REPOSITORY = 'DaddyDom8249/BeatVision';
const MAX_DELETIONS = 80;
const RESERVED = ['archive/', 'release/'];

export function classifyBranch(branch, openRefs, mergedHeads, compare) {
  if (!branch?.name || !branch?.commit?.sha) return 'incomplete branch record';
  if (branch.name === 'main' || RESERVED.some(prefix => branch.name.startsWith(prefix))) return 'reserved branch';
  if (branch.protected) return 'protected branch';
  if (openRefs.has(branch.name)) return 'referenced by an open PR';
  if (!mergedHeads.has(branch.name + '\0' + branch.commit.sha)) return 'head has no identical merged PR';
  if (!compare || compare.ahead_by !== 0 || !['behind', 'identical'].includes(compare.status))
    return 'head not proven reachable from main';
  return null; // Eligible.
}

async function cleanup() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || process.env.GITHUB_REPOSITORY !== REPOSITORY ||
      process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME !== 'push')
    throw new Error('One-time cleanup requires a main-branch GitHub Actions push with scoped token.');
  const root = 'https://api.github.com/repos/' + REPOSITORY;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  async function request(path, method = 'GET', missingOK = false) {
    const response = await fetch(root + path, { method, headers });
    if (missingOK && response.status === 404) return null;
    if (!response.ok) throw new Error(method + ' ' + path + ' returned HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  async function pages(path, maxPages = 6) {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const values = await request(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
      if (!Array.isArray(values)) throw new Error('GitHub collection response is not an array.');
      all.push(...values);
      if (values.length < 100) return all;
    }
    throw new Error('Pagination exceeded bound; refusing a partial cleanup.');
  }

  const mainRef = await request('/git/ref/heads/main');
  const mainSha = mainRef?.object?.sha;
  if (!mainSha) throw new Error('Missing authoritative main ref.');
  const [branches, openPRs, closedPRs] = await Promise.all([
    pages('/branches'), pages('/pulls?state=open'), pages('/pulls?state=closed'),
  ]);
  const openRefs = new Set(openPRs.flatMap(pr => [pr.head?.ref, pr.base?.ref]).filter(Boolean));
  const mergedHeads = new Set(closedPRs
    .filter(pr => pr.merged_at && pr.head?.repo?.full_name === REPOSITORY)
    .map(pr => pr.head.ref + '\0' + pr.head.sha));

  const eligible = [];
  for (const branch of branches) {
    if (branch.name === 'main' || branch.protected ||
        RESERVED.some(prefix => branch.name.startsWith(prefix)) ||
        openRefs.has(branch.name) ||
        !mergedHeads.has(branch.name + '\0' + branch.commit.sha)) continue;
    // Compare immutable hashes, not branch names, to prove no unique commits.
    const comparison = await request('/compare/' + mainSha + '...' + branch.commit.sha);
    if (classifyBranch(branch, openRefs, mergedHeads, comparison) === null) eligible.push(branch);
  }
  if (eligible.length > MAX_DELETIONS) throw new Error('More than ' + MAX_DELETIONS + ' deletions proposed; fail closed.');
  console.log('Verified eligible: ' + eligible.length + ' of ' + branches.length +
    ' refs; open PRs: ' + openPRs.length + '.');
  let deleted = 0;
  for (const branch of eligible) {
    // Verify a concurrent change cannot silently turn a merged branch into work in progress.
    const currentMain = await request('/git/ref/heads/main');
    if (currentMain?.object?.sha !== mainSha)
      throw new Error('main advanced during cleanup; stopped before deleting further refs.');
    const encoded = branch.name.split('/').map(encodeURIComponent).join('/');
    const fresh = await request('/branches/' + encoded, 'GET', true);
    if (!fresh || fresh.protected || fresh.commit?.sha !== branch.commit.sha) {
      console.log('SKIP changed branch ' + branch.name);
      continue;
    }
    const nowOpen = await pages('/pulls?state=open');
    if (nowOpen.some(pr => pr.head?.ref === branch.name || pr.base?.ref === branch.name)) {
      console.log('SKIP newly referenced branch ' + branch.name);
      continue;
    }
    await request('/git/refs/heads/' + encoded, 'DELETE');
    deleted++;
    console.log('DELETED merged ' + branch.name + ' @ ' + branch.commit.sha);
  }
  console.log('Completed: ' + deleted + ' branch refs deleted, with commits retained in main.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cleanup().catch(error => {
    console.error('Cleanup stopped: ' + error.message);
    process.exitCode = 1;
  });
}
