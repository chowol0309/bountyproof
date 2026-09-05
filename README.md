# BountyProof

Concurrent evidence review for public software bounties, built with Mozaik 4.0.5.

**Status: initial hackathon entry submitted on 5 September 2026; the official page confirmed receipt. Reliable live review remains incomplete. Replay and mocked-provider tests pass. A local Qwen3 inference experiment produced an incorrect diagnostic finding, and full concurrent runs were manually stopped without a completed result. Submission receipt does not establish judging eligibility or a prize. This project has earned no money.**

A large advertised reward can hide an already assigned task, existing submissions, or unresolved payment conditions. BountyProof collects a bounded public GitHub snapshot and lets availability, payment, and eligibility agents review it concurrently. A critic reacts to shared evidence revisions. When new evidence arrives during its review, the stale review is discarded and a new one runs.

The output is a traceable decision to stop speculative work or verify unresolved conditions. It never applies to a bounty, posts a comment, signs an agreement, handles money, or claims that a reward will be paid.

## Run the reproducible demo

Requires Node.js 22 or newer.

```sh
npm ci --omit=dev --omit=optional --ignore-scripts
npm test
npm run demo
```

`npm run demo` is explicitly a **deterministic replay using a test double**, not an AI inference demo. The Mozaik event bus, agents, shared state, agent loops, citation checks, revision handling, timeout handling and report writer execute normally. The model responses and response delays are scripted. The supplied real-world source excerpt is a historical snapshot and must not be taken as current availability.

The characteristic trace is:

```text
agent.started     availability
agent.started     payment
agent.started     eligibility
agent.completed   availability
agent.completed   payment
agent.started     critic
agent.completed   eligibility
critic.stale      → revision 3
agent.started     critic
agent.completed   critic
review.finished
```

## Collect fresh public evidence

```sh
node src/collect.mjs https://github.com/tenstorrent/tt-metal/issues/55502 reports/evidence.json
```

The collector makes three parallel unauthenticated GitHub API requests for the issue, comments and recent PRs. It writes to a new output file and refuses to overwrite an existing one. It reads no GitHub credential. API rate limits apply.

Collection is deliberately bounded: first 100 comments and 100 recently updated PRs; at most 24 comments and 8 matching PRs enter the review. Source text has a size limit. Every bundle records these limits. Cross-repository PRs, comment-only PR references, linked terms, payment transactions and personal eligibility are not independently verified. A match for an issue number can be ambiguous. Absence of a PR match does not prove absence of competition.

## Connect an actual model

Live mode requires a model endpoint you control or are authorized to use. There is no bundled free inference credit. A remote endpoint receives the entire selected evidence bundle and peer findings. Use only material you are permitted to disclose. Provider charges may apply; the program makes at most five bounded inference calls per review and does not retry failed calls.

PowerShell example for an already running local OpenAI-compatible model server:

```powershell
$env:BOUNTYPROOF_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions'
$env:BOUNTYPROOF_MODEL = 'your-installed-model-id'
node src/cli.mjs --live reports/evidence.json
```

For a remote service use its full HTTPS chat/completions endpoint and set `BOUNTYPROOF_API_KEY` securely in your environment if needed. Never commit keys or put credentials in the URL. The adapter has been tested with mocked HTTP responses; compatibility with a real provider remains unverified. Unsupported/invalid responses produce an unresolved review rather than a silent replay fallback.

An experimental CPU-only path is documented in [LOCAL-INFERENCE.md](LOCAL-INFERENCE.md). It uses a separately downloaded Qwen3 model and requires optional local runtime packages. This experiment has **not** established usable model quality or acceptable concurrent latency. Do not present it as a successful live demo.

## Architecture

`review.requested` starts three Mozaik participants. Each has its own memory and `runLoop`. Their `model.answer` events update a shared `RuntimeState` ledger and publish `evidence.changed`. The critic's situation handler reacts as soon as two findings exist. Its active revision is compared with the current ledger before accepting its answer. An observer writes the trace and validates exact source quotes.

This is event-driven coordination: a slow eligibility reviewer does not block payment review, and a critic may already be working when new evidence arrives. The same runtime code is used for replay and live mode, with the inference runner injected.

Files:

- `src/review.mjs`: Mozaik participants, events, shared state and revision handling.
- `src/evidence.mjs`: source validation, role instructions, structured finding checks.
- `src/runners.mjs`: explicit replay and configured chat-completions adapters.
- `src/collect.mjs`: bounded public GitHub evidence collection.
- `src/cli.mjs`: mode selection, trace and JSON report output.
- `test/review.test.mjs`: concurrency, stale findings, fabricated quotes, failures, deadlines, provider protocol and collection bounds.

## Limits and evaluation

Exact quote matching establishes that a cited string exists in a source. It does **not** prove that the source is truthful, authoritative, complete, current, or logically supports the model's conclusion. Source text is treated as untrusted in the prompt, but prompt-injection resistance has not been established by live adversarial evaluation. No execution tools are exposed to the reviewers.

`complete: true` means every review stage returned a schema-valid, quote-checked finding for the latest evidence revision. It does not mean that an opportunity is funded or that the applicant is eligible. An unresolved run exits with code 2. Invalid CLI configuration exits with code 1.

The Mozaik dependency supports optional cloud telemetry. During this project's local validation it reported telemetry disabled because no Mozaik API key was configured. Review the upstream configuration before pairing it with a cloud account.

## Contest context

Prepared for the [JigJoy concurrent-agent hackathon](https://build.jigjoy.ai/). The participant supplied a logged-in dashboard screenshot confirming solo registration on 2026-09-05 and the [submission page](https://build.jigjoy.ai/submit). Repository: [chowol0309/bountyproof](https://github.com/chowol0309/bountyproof).

The [official rules updated 4 September](https://build.jigjoy.ai/rules), inspected on 5 September, require Mozaik and at least two concurrent agents. AI-assisted development is allowed. An accessible repository, description and concurrency explanation are required; video, deployment and screenshots are optional but recommended. The written deadline is 7 September at 09:00 CET, also described as 03:00 ET / midnight PT; the CET label and summer-time equivalents require clarification. Cash winners need an Upwork account able to receive payment. Reliable live review remains unverified. The participant dashboard advertises a Mozaik Cloud observability trial; it has not been established as language-model inference credit. Public starting resources include the [Mozaik examples](https://github.com/jigjoy-ai/mozaik-examples) and [CLI starter](https://github.com/jigjoy-ai/cli-agent-starter).

No affiliation with the referenced bounty organizers is implied.
