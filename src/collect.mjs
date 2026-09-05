import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateCase } from './evidence.mjs';

// Public GitHub only. No authentication token is read or transmitted.
export function issueCoordinates(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || !match || url.search || url.hash) throw new Error('Supply a public https://github.com/owner/repo/issues/123 URL.');
  return { owner: match[1], repo: match[2], number: match[3] };
}
export async function collect(value, fetchImpl = fetch) {
  const { owner, repo, number } = issueCoordinates(value);
  const root = `https://api.github.com/repos/${owner}/${repo}`;
  const get = async path => {
    const response = await fetchImpl(root + path, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'BountyProof-public-evidence' } });
    if (!response.ok) throw new Error(`Public GitHub request failed: HTTP ${response.status}. No completeness claim was produced.`);
    return { data: await response.json(), hasMore: (response.headers.get('link') ?? '').includes('rel="next"') };
  };
  const [issue, comments, pulls] = await Promise.all([get(`/issues/${number}`), get(`/issues/${number}/comments?per_page=100`), get('/pulls?state=all&sort=updated&direction=desc&per_page=100')]);
  if (issue.data.pull_request) throw new Error('This URL identifies a PR; supply an issue.');
  const now = new Date().toISOString();
  // Keep the entire collector output below the review input limit, including
  // JSON escaping overhead and the collection-limits notice.
  let remaining = 65000;
  const trunc = text => {
    const result = String(text ?? '').slice(0, Math.min(7000, remaining));
    remaining -= result.length;
    return result;
  };
  const sources = [{ id: 'issue', url: issue.data.html_url, observedAt: now, text: JSON.stringify({ title: issue.data.title, state: issue.data.state, assignees: issue.data.assignees?.map(a => a.login), authorAssociation: issue.data.author_association, bodyExcerpt: trunc(issue.data.body) }) }];
  // Search the bounded PR snapshot by exact issue reference. This is explicitly
  // incomplete: cross-repo PRs and references only in comments are not covered.
  const reference = new RegExp(`(?:#|/issues/)${number}(?!\\d)`);
  const matching = pulls.data.filter(pr => reference.test(`${pr.title}\n${pr.body}`));
  for (const pr of matching.slice(0, 8)) sources.push({ id: `pr-${pr.number}`, url: pr.html_url, observedAt: now, text: JSON.stringify({ title: pr.title, state: pr.state, mergedAt: pr.merged_at, bodyExcerpt: trunc(pr.body) }) });
  for (const comment of comments.data.slice(-24)) sources.push({ id: `comment-${comment.id}`, url: comment.html_url, observedAt: now, text: JSON.stringify({ authorAssociation: comment.author_association, bodyExcerpt: trunc(comment.body) }) });
  sources.push({ id: 'collection-limits', url: value, observedAt: now, text: JSON.stringify({ commentsHasMorePages: comments.hasMore, pullsHasMorePages: pulls.hasMore, commentsIncluded: Math.min(comments.data.length, 24), matchingPulls: matching.length, scope: 'Only the first 100 issue comments and 100 most recently updated PRs were fetched. Up to 24 comments and 8 matching PRs are included, with bodies truncated at 7000 characters and a shared 65000-character body budget. Linked terms, cross-repo PRs, deleted comments, full payment records and identity are NOT verified. Zero matches does not prove zero competing submissions.' }) });
  return validateCase({ title: issue.data.title, collectedAt: now, sources });
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  try {
    const [url, destination, ...extra] = process.argv.slice(2);
    if (!url || !destination || extra.length) throw new Error('Usage: node src/collect.mjs <public-issue-url> <new-output.json>');
    const result = await collect(url);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`Saved ${result.sources.length} evidence sources to ${destination}. Read collection-limits before relying on the result.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
