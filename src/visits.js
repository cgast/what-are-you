// Visit lifecycle: create from a request, add evidence, recompute and persist the verdict.

import { classifyVisit } from './detect/classify.js';

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v) => (typeof v === 'boolean' ? v : null);
const strArr = (v, maxItems = 20, max = 60) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, max)) : null);
const pair = (v) => (Array.isArray(v) && v.length === 2 ? v.map(num) : null);

/** Whitelist + coerce browser-supplied facts. Anything unexpected is dropped. */
export function sanitizeClientFacts(c) {
  if (!c || typeof c !== 'object') return null;
  const b = c.behavior && typeof c.behavior === 'object' ? c.behavior : {};
  const behaviorKeys = ['mouseMoves', 'strokes', 'straightStrokes', 'touches', 'wheels', 'scrolls', 'keys', 'keyIntervalStd', 'pastes',
    'inputsWithoutKeys', 'clicks', 'clicksWithoutMove', 'centerClicks', 'untrusted', 'firstInteractionMs', 'longPauses', 'focusChanges'];
  return {
    ua: str(c.ua, 500),
    uaData: c.uaData && typeof c.uaData === 'object' ? { brands: strArr(c.uaData.brands), mobile: bool(c.uaData.mobile), platform: str(c.uaData.platform, 40) } : null,
    webdriver: bool(c.webdriver),
    languages: strArr(c.languages),
    plugins: num(c.plugins),
    hwConcurrency: num(c.hwConcurrency),
    deviceMemory: num(c.deviceMemory),
    maxTouchPoints: num(c.maxTouchPoints),
    chromeObj: bool(c.chromeObj),
    automationGlobals: strArr(c.automationGlobals),
    cdp: bool(c.cdp),
    webgl: c.webgl && typeof c.webgl === 'object' ? { vendor: str(c.webgl.vendor, 120), renderer: str(c.webgl.renderer, 200) } : null,
    notification: c.notification && typeof c.notification === 'object' ? { permission: str(c.notification.permission, 20), query: str(c.notification.query, 20) } : null,
    window: c.window && typeof c.window === 'object' ? { inner: pair(c.window.inner), outer: pair(c.window.outer), screen: pair(c.window.screen), dpr: num(c.window.dpr) } : null,
    tz: str(c.tz, 60),
    visibleMs: num(c.visibleMs),
    behavior: Object.fromEntries(behaviorKeys.map((k) => [k, num(b[k])])),
  };
}

const ROLES = new Set(['human', 'ai_agent', 'crawler', 'other']);
export function sanitizeDeclaration(d) {
  if (!d || typeof d !== 'object' || !ROLES.has(d.role)) return null;
  const task = str(d.task, 300)?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || null;
  return { role: d.role, task, at: Date.now() };
}

export function createVisitService(store) {
  function refresh(visit) {
    const verdict = classifyVisit(visit);
    store.saveVisit(visit, verdict);
    return verdict;
  }

  return {
    create({ ip, requestFacts }) {
      const draft = { requestFacts, clientFacts: null, events: [], declaration: null, createdAt: Date.now() };
      const verdict = classifyVisit(draft);
      const visit = store.createVisit({ ip, requestFacts, verdict });
      return { visit, verdict };
    },
    get: (id) => store.getVisit(id),
    verdictFor: (visit) => classifyVisit(visit),
    /** Apply new evidence; returns the fresh verdict. */
    update(visit, { clientFacts, event, declaration } = {}) {
      if (clientFacts) visit.clientFacts = clientFacts;
      if (declaration) visit.declaration = declaration;
      if (event && !visit.events.some((e) => e.type === event)) visit.events.push({ type: event, at: Date.now() });
      return refresh(visit);
    },
  };
}
