# Experimental local inference

This is an optional CPU path for testing the same Mozaik review without a paid API account. It is experimental: successful generation does not establish reliable bounty assessment.

## Windows setup used for development

Requires Node 22+ and an x64 Windows machine. The base replay and remote adapter do not require a local model.

```powershell
npm ci --omit=dev --omit=optional --ignore-scripts
npm install --save-dev --ignore-scripts --omit=optional node-llama-cpp@3.20.0 @node-llama-cpp/win-x64@3.20.0
```

The second command adds a machine-specific CPU package to the local development installation. Other platforms need the corresponding runtime package. Do not commit machine-specific manifest changes as cross-platform requirements.

Download the [official Qwen3-0.6B Q8_0 GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/blob/main/Qwen3-0.6B-Q8_0.gguf) separately. The model is not included in this source archive. The file tested during development is 639,446,688 bytes with SHA256:

```text
9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031
```

```powershell
node src/local-cli.mjs C:\path\to\Qwen3-0.6B-Q8_0.gguf evidence.json
```

The runner uses node-llama-cpp 3.20.0, CPU only, three shared inference sequences, three CPU threads, 2,048 tokens per sequence, a 1,500-token input check, and at most 180 output tokens per call. New external model calls and automatic model downloads are disabled. Full-size collected evidence bundles may exceed this deliberately small local context budget; the run must remain unresolved in that case. If you create a subset, record what was omitted.

Three reviewers start concurrently through Mozaik. The underlying local inference engine may batch/interleave their CPU work; this does not imply three separate model copies or simultaneous execution on three GPUs.

JSON grammar limits verdict labels, output shape, and source IDs to those present in the evidence bundle. Exact-quote validation still runs after generation. Grammar does not establish factual correctness or logical support.

## Evaluation notes

An initial larger-context CPU run did not produce usable findings promptly and was manually stopped. A short diagnostic prompt generated an incorrect CLEAR verdict for an already assigned bounty and invented a source ID. That diagnostic used a simpler prompt than the actual review. It motivated constraining source IDs to the supplied evidence.

The next evaluation used the actual role instructions, constrained source IDs, and a labelled compact selection from a fresh GitHub snapshot. It did not return a completed review during the observation window and was manually interrupted. Neither concurrent experiment completed successfully. The JavaScript timeout did not establish a reliable bound on wall time during native inference; this path needs process isolation and a supervised hard deadline before further use.

Conclusion: the local runtime loads and can generate model text, but this model/configuration has not demonstrated the quality or latency needed for a contest demo. No remote API was called and no paid inference was purchased. Further local experiments were stopped rather than treating schema constraints or replay tests as proof of model capability.
