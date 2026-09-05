import { createAgent, createHuman, defineRuntime, RuntimeState, SemanticEvent, SituationSpecification } from '@mozaik-ai/core';
import { roles, validateCase, validateFinding, promptFor, systemPrompt } from './evidence.mjs';
import { GuardedRunner } from './runners.mjs';

class On extends SituationSpecification {
  constructor(type) { super(); this.type = type; }
  isSatisfiedBy({ event }) { return event.type === this.type; }
}
class ReviewState extends RuntimeState {
  findings = {};
  errors = {};
  revision = 0;
}

export async function review(bundle, runner, { mode = 'replay', onEvent = () => {}, timeoutMs = 90000 } = {}) {
  validateCase(bundle);
  const state = new ReviewState();
  const runtime = defineRuntime();
  runtime.initializeRuntime({ state, inferenceRunnerConfig: { runner: new GuardedRunner(runner) } });
  const started = performance.now();
  const trace = [];
  const agents = new Map();
  let criticBusy = false, criticRevision = -1, finished = false, timer;
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const emit = (type, data = {}) => {
    const event = { ms: Math.round(performance.now() - started), type, ...data };
    trace.push(event);
    onEvent(event);
  };
  const count = () => Object.keys(state.findings).filter(role => roles.includes(role)).length;
  const finish = timedOut => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    for (const agent of agents.values()) runtime.leave(agent);
    runtime.leave(observer);
    const blocked = Object.values(state.findings).some(f => f.verdict === 'BLOCK');
    const complete = count() === roles.length && criticRevision === state.revision && state.findings.critic && !timedOut && Object.keys(state.errors).length === 0;
    const action = blocked ? 'DO_NOT_START' : 'VERIFY_BEFORE_COMMITTING';
    emit('review.finished', { action, complete: Boolean(complete), timedOut });
    resolveDone({ title: bundle.title, mode, action, complete: Boolean(complete), timedOut, revision: state.revision, findings: state.findings, errors: state.errors, sources: bundle.sources.map(({ id, url, observedAt }) => ({ id, url, observedAt })), trace });
  };
  const launch = (role, revision = state.revision) => {
    if (finished) return;
    const agent = agents.get(role);
    emit('agent.started', { role, revision });
    runtime.runLoop(agent.getId(), promptFor(role, bundle, state.findings, revision), { model: role, context: agent.getMemory().getContext(), tools: [], maxOutputTokens: 900 });
  };
  const scheduleCritic = () => {
    if (finished || count() < 2 || criticBusy) return;
    criticBusy = true;
    criticRevision = state.revision;
    launch('critic', criticRevision);
  };
  const observer = createHuman({ name: 'Evidence ledger', capabilities: [], handlers: [{ specification: new On('model.answer'), processor: { apply({ event }) {
    if (finished) return;
    const role = [...agents].find(([, agent]) => agent.getId() === event.producerId)?.[0];
    if (!role) return;
    let finding;
    try {
      const parsed = JSON.parse(event.payload.answer.content.text);
      finding = validateFinding(parsed, bundle);
    } catch {
      state.errors[role] = 'Invalid, unavailable, or ungrounded model answer.';
      finding = { verdict: 'VERIFY', summary: state.errors[role], evidence: [] };
    }
    if (role === 'critic') {
      criticBusy = false;
      if (criticRevision !== state.revision) {
        emit('critic.stale', { reviewedRevision: criticRevision, currentRevision: state.revision });
        scheduleCritic();
        return;
      }
      state.findings.critic = finding;
      emit('agent.completed', { role, revision: criticRevision, verdict: finding.verdict });
      if (count() === roles.length) finish(false);
      return;
    }
    state.findings[role] = finding;
    state.revision++;
    emit('agent.completed', { role, revision: state.revision, verdict: finding.verdict });
    runtime.sendEvent(SemanticEvent.create('evidence.changed', event.producerId, { revision: state.revision }), event.producerId);
  } } }] });
  for (const role of [...roles, 'critic']) {
    const handlers = role === 'critic' ? [{ specification: new On('evidence.changed'), processor: { apply: scheduleCritic } }] : [{ specification: new On('review.requested'), processor: { apply: () => launch(role) } }];
    const agent = createAgent({ name: role, instruction: systemPrompt, capabilities: ['inference', 'evidence-review'], tools: [], handlers });
    agents.set(role, agent);
    runtime.join(agent);
  }
  runtime.join(observer);
  timer = setTimeout(() => finish(true), timeoutMs);
  emit('review.started', { mode, sources: bundle.sources.length });
  runtime.sendEvent(SemanticEvent.create('review.requested', observer.getId(), {}), observer.getId());
  return done;
}
