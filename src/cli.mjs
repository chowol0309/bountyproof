import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { review } from './review.mjs';
import { ChatRunner, ReplayRunner } from './runners.mjs';

async function main() {
  const [flag, path, ...extra] = process.argv.slice(2);
  if (!['--replay', '--live'].includes(flag) || !path || extra.length) throw new Error('Usage: node src/cli.mjs --replay|--live <evidence.json>');
  const data = JSON.parse(await readFile(path, 'utf8'));
  const { replayAnswers, ...bundle } = data;
  const mode = flag.slice(2);
  let runner;
  if (mode === 'replay') {
    if (!replayAnswers) throw new Error('Replay requires explicit recorded/test answers.');
    runner = new ReplayRunner(replayAnswers, { availability: 60, payment: 130, eligibility: 220, critic: 140 });
    console.log('REPLAY / TEST DOUBLE — no language model call and no payment verification.');
  } else {
    if (!process.env.BOUNTYPROOF_ENDPOINT || !process.env.BOUNTYPROOF_MODEL) throw new Error('Live mode requires BOUNTYPROOF_ENDPOINT (full chat/completions URL) and BOUNTYPROOF_MODEL. Configure BOUNTYPROOF_API_KEY if required.');
    runner = new ChatRunner({ endpoint: process.env.BOUNTYPROOF_ENDPOINT, model: process.env.BOUNTYPROOF_MODEL, apiKey: process.env.BOUNTYPROOF_API_KEY });
    console.log('LIVE — sending this evidence bundle to your explicitly configured model endpoint. Up to 5 inference calls; provider charges may apply.');
  }
  const report = await review(bundle, runner, { mode, onEvent: event => console.log(`${String(event.ms).padStart(5)} ms  ${event.type.padEnd(18)} ${event.role ?? ''} ${event.verdict ?? ''}${event.currentRevision ? ` → revision ${event.currentRevision}` : ''}`) });
  console.log(`\n${report.action} | review complete: ${report.complete}`);
  for (const [role, result] of Object.entries(report.findings)) console.log(`${role}: ${result.summary}`);
  console.log('A completed review is not proof of eligibility, funding, or payment.');
  const dir = resolve('reports');
  await mkdir(dir, { recursive: true });
  const destination = resolve(dir, `review-${mode}-${Date.now()}.json`);
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${destination}`);
  if (!report.complete) process.exitCode = 2;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
