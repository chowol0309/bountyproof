import { ModelMessageItem } from '@mozaik-ai/core';

// Optional local inference. The GGUF file is supplied explicitly; this module
// never downloads a model or falls back to a remote service.
export async function createLocalRunner(modelPath) {
  const { getLlama, LlamaChatSession, QwenChatWrapper } = await import('node-llama-cpp');
  const llama = await getLlama({ gpu: false, build: 'never', skipDownload: true, maxThreads: 3 });
  let model, context;
  try {
    model = await llama.loadModel({ modelPath, gpuLayers: 0 });
    context = await model.createContext({ sequences: 3, contextSize: 2048, threads: 3, batchSize: 128 });
    return {
      async run(input) {
        const items = input.context.getItems();
        const system = items.filter(item => item.role === 'system' || item.role === 'developer').map(item => item.content.text).join('\n');
        const prompt = items.findLast(item => item.role === 'user')?.content.text;
        if (!prompt) throw new Error('Missing review prompt.');
        const sourceIds = JSON.parse(prompt).untrustedEvidence.sources.map(source => source.id);
        const grammar = await llama.createGrammarForJsonSchema({ type: 'object', properties: {
          verdict: { enum: ['BLOCK', 'VERIFY', 'CLEAR'] }, summary: { type: 'string' },
          evidence: { type: 'array', minItems: 0, maxItems: 1, items: { type: 'object', properties: { sourceId: { enum: sourceIds }, quote: { type: 'string' } }, required: ['sourceId', 'quote'] } }
        }, required: ['verdict', 'summary', 'evidence'] });
        if (model.tokenize(system + prompt).length > 1500) throw new Error('Evidence exceeds the local model context budget. Use a smaller, explicitly bounded evidence bundle.');
        const session = new LlamaChatSession({ contextSequence: context.getSequence(), autoDisposeSequence: true, systemPrompt: system, chatWrapper: new QwenChatWrapper({ variation: '3', thoughts: 'discourage' }) });
        try {
          const answer = await session.prompt(prompt + '\nKeep the summary to one sentence and cite at most one short exact quote. /no_think', { grammar, maxTokens: 180, temperature: 0, signal: AbortSignal.timeout(60000) });
          return { items: [ModelMessageItem.rehydrate({ text: answer })], tokenUsage: undefined, rowResponse: null };
        } finally { session.dispose(); }
      },
      async *stream() { throw new Error('Streaming is not enabled.'); },
      async dispose() { await context.dispose(); await model.dispose(); await llama.dispose(); }
    };
  } catch (error) {
    if (context) await context.dispose();
    if (model) await model.dispose();
    await llama.dispose();
    throw error;
  }
}
