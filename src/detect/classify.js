// Combines signals into a verdict: most likely category, a probability-like confidence, the
// runner-up hypotheses, and the signals ranked by how much they drove the decision.

import { CATEGORIES, categoryIds } from '../data/categories.js';
import { clientSignals, eventSignals, requestSignals } from './signals.js';

const TEMPERATURE = 2.5; // softmax temperature: higher = more cautious confidence
const BASELINE = 2; // score of the "unknown" hypothesis; evidence has to beat this
const PROMOTE = { automation: 'ai_browser_agent', script: 'ai_user_fetcher' };
const AI_EVIDENCE_THRESHOLD = 6;

export function classifyVisit(visit, now = Date.now()) {
  const signals = [
    ...requestSignals(visit.requestFacts),
    ...clientSignals(visit.clientFacts, visit.requestFacts),
    ...eventSignals(visit, now),
  ];
  return classifySignals(signals);
}

export function classifySignals(signals) {
  const scores = Object.fromEntries(categoryIds.map((id) => [id, 0]));
  for (const s of signals) for (const [cat, pts] of Object.entries(s.votes)) scores[cat] += pts;
  scores.unknown = Math.max(scores.unknown, BASELINE);

  // Cryptographic or DNS-verified identity overrides heuristics.
  const decisive = signals.filter((s) => s.decisive).flatMap((s) => Object.entries(s.votes)).sort((a, b) => b[1] - a[1])[0];

  // Softmax over hypotheses that have positive evidence (plus the "unknown" baseline), so that
  // categories nobody argued for don't dilute the confidence.
  const exp = Object.fromEntries(categoryIds.map((id) => [id, scores[id] > 0 ? Math.exp(scores[id] / TEMPERATURE) : 0]));
  const total = Object.values(exp).reduce((a, b) => a + b, 0);
  const probability = Object.fromEntries(categoryIds.map((id) => [id, exp[id] / total]));

  const ranked = categoryIds.slice().sort((a, b) => probability[b] - probability[a]);
  let category = decisive ? decisive[0] : ranked[0];
  let confidence = decisive ? Math.max(probability[category], 0.99) : probability[category];

  // Promotion: "automated" says *how* a visitor works; AI evidence says *who* is driving.
  // An automated browser/script with enough signs of a language model behind it is an AI agent.
  const aiEvidence = signals.filter((s) => s.aiEvidence).reduce((sum, s) => sum + Math.max(0, ...Object.values(s.votes)), 0);
  let reason = null;
  const from = category;
  if (!decisive && PROMOTE[category] && aiEvidence >= AI_EVIDENCE_THRESHOLD) {
    category = PROMOTE[from];
    confidence = probability[from] + probability[category];
    reason = `Automation fingerprints say "${CATEGORIES[from].label}"; the AI evidence says a language model is in control.`;
  }

  const impact = (s) => {
    const a = s.votes[category] || 0;
    const b = from !== category ? s.votes[from] || 0 : 0;
    return Math.abs(a) >= Math.abs(b) ? a : b;
  };
  const rankedSignals = signals
    .map((s) => ({ ...s, impact: impact(s) }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || Object.keys(b.votes).length - Object.keys(a.votes).length);

  return {
    category,
    ...CATEGORIES[category],
    confidence,
    decisive: Boolean(decisive),
    reason,
    alternatives: ranked
      .filter((id) => id !== category && id !== from && probability[id] >= 0.05 && id !== 'unknown')
      .slice(0, 3)
      .map((id) => ({ category: id, label: CATEGORIES[id].label, icon: CATEGORIES[id].icon, probability: probability[id] })),
    scores,
    signals: rankedSignals,
  };
}
