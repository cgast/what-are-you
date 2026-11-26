// The verdict fragment. Rendered on the server for the initial page and again for every live
// update (the API returns this HTML), so there is exactly one renderer.

import { CATEGORIES } from '../data/categories.js';
import { html } from '../lib/html.js';

const GROUP_LABEL = {
  identity: 'Identity',
  network: 'Network',
  headers: 'HTTP headers',
  browser: 'Browser',
  behavior: 'Behaviour',
  interaction: 'Interaction',
  trap: 'Traps & beacons',
};

/** Percent for display; only verified identities may claim certainty. */
export const pct = (p, verified = false) => `${Math.min(verified ? 100 : 99, Math.round(p * 100))}%`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));

function signalItem(s) {
  const tone = s.impact > 0 ? 'pos' : s.impact < 0 ? 'neg' : 'neutral';
  const title = Object.entries(s.votes)
    .filter(([, v]) => v)
    .map(([k, v]) => `${signed(v)} ${CATEGORIES[k]?.label || k}`)
    .join(', ');
  return html`<li class="signal ${tone}">
    <span class="impact" title="${title || 'no effect on any category'}">${s.impact ? signed(s.impact) : '·'}</span>
    <span class="what"><span class="group">${GROUP_LABEL[s.group] || s.group}</span> ${s.label}</span>
    <span class="observed">${s.observed}</span>
  </li>`;
}

export function renderVerdict(verdict) {
  const top = verdict.signals.filter((s) => s.impact !== 0).slice(0, 8);
  const rest = verdict.signals.filter((s) => !top.includes(s));
  return html`
  <div class="verdict-head">
    <span class="verdict-icon" aria-hidden="true">${verdict.icon}</span>
    <div>
      <p class="eyebrow">You are most likely</p>
      <h1 class="verdict-label">${verdict.label}</h1>
      <p class="intent">${verdict.intent}</p>
    </div>
  </div>
  <div class="confidence">
    <meter min="0" max="1" low="0.4" high="0.75" optimum="1" value="${verdict.confidence.toFixed(3)}">${pct(verdict.confidence, verdict.decisive)}</meter>
    <span>${pct(verdict.confidence, verdict.decisive)} confident${verdict.decisive ? ' · identity verified' : ''}</span>
  </div>
  ${verdict.reason ? html`<p class="reason">${verdict.reason}</p>` : ''}
  ${verdict.alternatives.length
    ? html`<p class="alternatives">Could also be: ${verdict.alternatives.map(
        (a, i) => html`${i ? ', ' : ''}<span class="alt">${a.icon} ${a.label} <small>${pct(a.probability)}</small></span>`,
      )}</p>`
    : ''}
  <h2>Why we think so</h2>
  ${top.length ? html`<ol class="signals">${top.map(signalItem)}</ol>` : html`<p class="muted">No strong evidence yet. Move around, click something, or tell us below.</p>`}
  ${rest.length
    ? html`<details class="more"><summary>${rest.length} more observation${rest.length > 1 ? 's' : ''} that did not affect this verdict</summary>
        <ol class="signals">${rest.map(signalItem)}</ol></details>`
    : ''}`;
}

/** Compact JSON shape for API/agents. */
export function verdictJson(verdict) {
  return {
    category: verdict.category,
    label: verdict.label,
    intent: verdict.intent,
    confidence: Number(verdict.confidence.toFixed(3)),
    verified: verdict.decisive,
    reason: verdict.reason,
    alternatives: verdict.alternatives.map((a) => ({ category: a.category, probability: Number(a.probability.toFixed(3)) })),
    signals: verdict.signals.map((s) => ({ group: s.group, id: s.id, label: s.label, observed: s.observed, impact: s.impact, votes: s.votes })),
  };
}
