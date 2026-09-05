import { ModelMessageItem } from '@mozaik-ai/core';
import { setTimeout as delay } from 'node:timers/promises';

const output = value => ({ items: [ModelMessageItem.rehydrate({ text: JSON.stringify(value) })], tokenUsage: undefined, rowResponse: null });

// Explicit deterministic test double. It does not call a language model.
export class ReplayRunner {
  constructor(answers, delays = {}) { this.answers = answers; this.delays = delays; }
  async run(input) {
    await delay(this.delays[input.model] ?? 25);
    const value = this.answers[input.model];
    if (!value) throw new Error(`Missing replay answer for ${input.model}`);
    return output(value);
  }
  async *stream() { throw new Error('Streaming is not enabled.'); }
}

export class ChatRunner {
  constructor({ endpoint, model, apiKey, timeoutMs = 30000, fetchImpl = fetch }) {
    const url = new URL(endpoint);
    if (url.username || url.password) throw new Error('Do not embed credentials in the endpoint.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS or a loopback endpoint.');
    if (!model) throw new Error('An explicit model is required.');
    Object.assign(this, { endpoint, model, apiKey, timeoutMs, fetchImpl });
  }
  async run(input) {
    const messages = input.context.getItems().filter(item => item.type === 'message').map(item => ({ role: item.role === 'developer' ? 'system' : item.role, content: item.content.text }));
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 900, stream: false })
    });
    if (!response.ok) throw new Error(`Inference HTTP ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length > 16000) throw new Error('Invalid model response.');
    return { items: [ModelMessageItem.rehydrate({ text })], tokenUsage: undefined, rowResponse: null };
  }
  async *stream() { throw new Error('Streaming is not enabled.'); }
}

// Mozaik's runLoop is fire-and-forget. Convert runner failures into an explicit
// answer so the observer can settle that review instead of leaving a hung run.
export class GuardedRunner {
  constructor(inner) { this.inner = inner; }
  async run(input) {
    try { return await this.inner.run(input); }
    catch { return output({ error: 'Inference failed or timed out; this review is unresolved.' }); }
  }
  async *stream() { throw new Error('Streaming is not enabled.'); }
}
