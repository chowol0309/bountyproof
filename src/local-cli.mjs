import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { review } from './review.mjs';
import { createLocalRunner } from './local-runner.mjs';
async function main() {
  const [modelPath, evidencePath, ...extra] = process.argv.slice(2);
  if (!modelPath || !evidencePath || extra.length) throw new Error('Usage: node src/local-cli.mjs <Qwen3 GGUF path> <evidence.json>');
  const { replayAnswers, ...bundle } = JSON.parse(await readFile(evidencePath, 'utf8'));
  console.log('LIVE LOCAL INFERENCE — real Qwen3 model, CPU only, no API requests.');
  const runner = await createLocalRunner(modelPath);
  try {
    const report = await review(bundle, runner, { mode: 'live-local', timeoutMs: 240000, onEvent: e => console.log(`${String(e.ms).padStart(6)} ms  ${e.type.padEnd(18)} ${e.role ?? ''} ${e.verdict ?? ''}`) });
    report.model = basename(modelPath);
    await mkdir('reports', { recursive: true });
    const destination = resolve('reports', `review-live-local-${Date.now()}.json`);
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ action: report.action, complete: report.complete, findings: report.findings, errors: report.errors, destination }, null, 2));
    if (!report.complete) process.exitCode = 2;
  } finally { await runner.dispose(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
