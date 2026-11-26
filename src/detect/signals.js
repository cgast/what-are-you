// Turns facts (server request facts, browser probe facts, visit events) into weighted signals.
// A signal = what we looked at, what we saw, and how it shifts the scores of each category.
// All interpretation lives here so that weights can be tuned in one place.

import { AGENTS, GENERIC_BOT_UA, matchAgent, SIGNATURE_AGENTS } from '../data/agents.js';

/**
 * @typedef {{id:string, group:string, label:string, observed:string, votes:Record<string,number>,
 *            decisive?:boolean, note?:string}} Signal
 */
const signal = (group, id, label, observed, votes, extra = {}) => ({ group, id, label, observed: String(observed), votes, ...extra });

// Categories that never run JavaScript in a real browser.
const NON_BROWSER = { script: -4, ai_user_fetcher: -3, preview_bot: -2, crawler: -2, seo_crawler: -2, scanner: -2 };
const BROWSER_UA = /Mozilla\/5\.0 .*(?:Chrome|Firefox|Safari|Edg|OPR)\//;

// ---------------------------------------------------------------------------------------------
// Server-side request facts
// ---------------------------------------------------------------------------------------------
export function requestSignals(f) {
  const out = [];
  const h = f.headers || {};
  const agent = matchAgent(f.ua);
  const browserUa = !agent && BROWSER_UA.test(f.ua);

  // Identity claim
  if (!f.ua) {
    out.push(signal('identity', 'ua-missing', 'User-Agent header', 'missing entirely', { script: 5, scanner: 3, crawler: 1 }));
  } else if (agent) {
    const v = f.verification;
    const named = `${agent.name} (${agent.operator})`;
    if (v?.result === 'verified') {
      out.push(signal('identity', 'ua-verified', 'Claimed identity', `${named}, verified: ${v.detail}`, { [agent.category]: 25 }, { decisive: true }));
    } else if (v?.result === 'failed') {
      out.push(signal('identity', 'ua-spoofed', 'Claimed identity', `${named}, but verification FAILED: ${v.detail}`, { impersonator: 14, script: 2 }));
    } else if (['script', 'automation'].includes(agent.category)) {
      out.push(signal('identity', 'ua-tool', 'User-Agent', `identifies as ${agent.name}`, { [agent.category]: 8 }));
    } else {
      out.push(signal('identity', 'ua-claimed', 'Claimed identity', `${named}, not verifiable: ${v?.detail || 'no verification method'}`, { [agent.category]: 7 }));
    }
  } else if (GENERIC_BOT_UA.test(f.ua)) {
    out.push(signal('identity', 'ua-generic-bot', 'User-Agent', 'calls itself a bot/crawler/spider but matches no known one', { crawler: 7 }));
  } else if (browserUa) {
    out.push(signal('identity', 'ua-browser', 'User-Agent', 'looks like a regular browser', { human: 1, automation: 1, ai_browser_agent: 1 }));
  } else {
    out.push(signal('identity', 'ua-odd', 'User-Agent', 'neither a known browser nor a known bot', { script: 2, crawler: 2 }));
  }

  // Web Bot Auth (cryptographic identity)
  const wba = f.webBotAuth;
  if (wba?.present && wba.verified) {
    const host = safeHost(wba.agentUri);
    const known = SIGNATURE_AGENTS.find((s) => host === s.host || host?.endsWith(`.${s.host}`));
    const category = known?.category || (wba.card?.trigger === 'fetcher' ? 'ai_user_fetcher' : 'signed_bot');
    const who = known ? `${known.name} (${known.operator})` : wba.card?.name || host || 'unknown signer';
    out.push(signal('identity', 'wba-verified', 'Web Bot Auth signature', `valid signature from ${who} (key ${short(wba.keyid)})`, { [category]: 30 }, { decisive: true }));
  } else if (wba?.present) {
    out.push(signal('identity', 'wba-invalid', 'Web Bot Auth signature', `signature headers present but not valid: ${wba.error || 'unknown error'}`, { impersonator: 4, signed_bot: 2 }));
  }

  // Published IP ranges, independent of the claimed User-Agent (catches unannounced visits).
  const verifiedList = f.verification?.result === 'verified' && f.verification.method === 'ip-list';
  for (const listId of f.network?.ipLists || []) {
    const owner = AGENTS.find((x) => x.verify?.ipList === listId);
    if (!owner || (verifiedList && owner.id === agent?.id)) continue;
    out.push(signal('network', `iplist-${listId}`, 'Published IP ranges', `your address belongs to ${owner.name} (${owner.operator})`, { [owner.category]: 12 }));
  }
  if (f.network?.kind === 'datacenter') {
    out.push(signal('network', 'net-datacenter', 'Network', `reverse DNS points to a hosting/cloud network (${f.network.rdnsDomain})`, { automation: 2, script: 2, ai_browser_agent: 2, ai_user_fetcher: 1, human: -2 }));
  } else if (f.network?.kind === 'residential') {
    out.push(signal('network', 'net-residential', 'Network', `reverse DNS looks like a consumer ISP (${f.network.rdnsDomain})`, { human: 2 }));
  }

  // Header consistency: real browsers send a characteristic set of headers.
  const hasSecFetch = Boolean(h['sec-fetch-mode'] || h['sec-fetch-dest']);
  if (browserUa && f.secure && !hasSecFetch) {
    out.push(signal('headers', 'hdr-no-secfetch', 'Sec-Fetch-* headers', 'missing, though every modern browser sends them over HTTPS', { script: 6, ai_user_fetcher: 2, ai_retrieval: 2 }));
  } else if (hasSecFetch && h['sec-fetch-mode'] === 'navigate' && h['sec-fetch-dest'] === 'document') {
    out.push(signal('headers', 'hdr-navigate', 'Sec-Fetch-* headers', `genuine browser navigation (site=${h['sec-fetch-site'] || '?'}, user=${h['sec-fetch-user'] || '?0'})`, { human: 2, automation: 1, ai_browser_agent: 1 }));
  }
  const chromeMajor = Number(/Chrome\/(\d+)/.exec(f.ua)?.[1] || 0);
  if (browserUa && f.secure && chromeMajor >= 90 && !/Firefox|FxiOS/.test(f.ua) && !h['sec-ch-ua']) {
    out.push(signal('headers', 'hdr-no-ch', 'Client hints (Sec-CH-UA)', `missing although the UA claims Chrome ${chromeMajor}`, { script: 3, automation: 1 }));
  }
  if (!h['accept-language']) {
    out.push(signal('headers', 'hdr-no-lang', 'Accept-Language', 'missing (browsers always send one)', { script: 2, automation: 2, crawler: 1, ai_user_fetcher: 1 }));
  } else if (browserUa) {
    out.push(signal('headers', 'hdr-lang', 'Accept-Language', h['accept-language'], { human: 1 }));
  }
  const accept = h.accept || '';
  if (/text\/markdown/.test(accept) && !/text\/html/.test(accept.split(',')[0])) {
    out.push(signal('headers', 'hdr-markdown', 'Accept', `asks for Markdown (${accept}), typical for LLM tooling`, { ai_user_fetcher: 3, ai_retrieval: 3 }, { aiEvidence: true }));
  } else if (browserUa && (!accept || accept === '*/*')) {
    out.push(signal('headers', 'hdr-accept-any', 'Accept', `"${accept || 'missing'}" instead of a browser's text/html list`, { script: 2 }));
  }
  if (/\b(br|zstd)\b/.test(h['accept-encoding'] || '')) {
    out.push(signal('headers', 'hdr-encoding', 'Accept-Encoding', h['accept-encoding'], { human: 1, automation: 1, ai_browser_agent: 1 }));
  }
  if (h.dnt === '1' || h['sec-gpc'] === '1') {
    out.push(signal('headers', 'hdr-privacy', 'Privacy preference', `${h['sec-gpc'] === '1' ? 'Sec-GPC' : 'DNT'}: 1, a setting people choose`, { human: 1 }));
  }
  if (h.from) {
    out.push(signal('headers', 'hdr-from', 'From header', `${h.from} (crawlers use it for contact details)`, { crawler: 2, search_crawler: 1, seo_crawler: 1 }));
  }
  if (/prefetch|prerender/.test(`${h['sec-purpose'] || ''}${h.purpose || ''}`)) {
    out.push(signal('headers', 'hdr-prefetch', 'Purpose', 'this request was a speculative prefetch', {}));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Browser probe facts (collected by public/probe.js; untrusted and treated as such)
// ---------------------------------------------------------------------------------------------
export function clientSignals(c, requestFacts) {
  if (!c) return [];
  const out = [];
  const b = c.behavior || {};
  const automation = (id, label, observed, pts = 6) => out.push(signal('browser', id, label, observed, { automation: pts, ai_browser_agent: Math.ceil(pts / 3) }));

  out.push(signal('browser', 'js-ran', 'JavaScript', 'executed our probe script', { human: 2, automation: 1, ai_browser_agent: 1, ...NON_BROWSER }));

  if (c.webdriver === true) automation('webdriver', 'navigator.webdriver', 'true (set by WebDriver/CDP automation)', 9);
  if (/Headless/i.test(c.ua) || c.uaData?.brands?.some((x) => /Headless/i.test(x))) automation('headless-ua', 'JS user agent', 'contains "Headless"', 9);
  if (c.automationGlobals?.length) automation('automation-globals', 'Automation fingerprints', c.automationGlobals.join(', '), 9);
  if (c.cdp) automation('cdp', 'DevTools protocol', 'console serialisation triggered (Runtime domain enabled)', 5);
  const chromeUa = /Chrome\//.test(c.ua) && !/Edg|OPR|SamsungBrowser/.test(c.ua);
  const mobile = c.uaData?.mobile || /Mobile|Android|iPhone/.test(c.ua);
  if (chromeUa && !c.chromeObj) automation('no-chrome-obj', 'window.chrome', 'missing in a Chrome user agent', 3);
  if (chromeUa && !mobile && c.plugins === 0) automation('no-plugins', 'navigator.plugins', 'empty on desktop Chrome (normally 5 PDF viewers)', 3);
  if (Array.isArray(c.languages) && c.languages.length === 0) automation('no-languages', 'navigator.languages', 'empty', 4);
  if (c.webgl?.renderer && /SwiftShader|llvmpipe|softpipe|Mesa OffScreen/i.test(c.webgl.renderer)) {
    out.push(signal('browser', 'soft-gl', 'WebGL renderer', `${c.webgl.renderer} (software rendering: headless or a VM)`, { automation: 3, ai_browser_agent: 2, human: -1 }));
  } else if (c.webgl?.renderer) {
    out.push(signal('browser', 'gpu', 'WebGL renderer', c.webgl.renderer, { human: 1 }));
  }
  const [ow, oh] = c.window?.outer || [];
  if (ow === 0 && oh === 0) automation('zero-outer', 'Window size', 'outer window is 0×0 (no real window)', 4);
  const [iw, ih] = c.window?.inner || [];
  if ((iw === 1280 && ih === 720) || (iw === 800 && ih === 600)) {
    out.push(signal('browser', 'default-viewport', 'Viewport', `${iw}×${ih}, a default automation viewport`, { automation: 2, ai_browser_agent: 2 }));
  }
  if (c.notification?.permission === 'denied' && c.notification?.query === 'prompt') {
    automation('notif-mismatch', 'Permissions API', 'Notification "denied" but permission query says "prompt" (headless quirk)', 4);
  }
  if (requestFacts?.ua && c.ua && requestFacts.ua !== c.ua) {
    out.push(signal('browser', 'ua-mismatch', 'User-Agent consistency', 'HTTP header and JavaScript report different user agents', { automation: 3, script: 2, impersonator: 2 }));
  }

  // --- Behaviour -------------------------------------------------------------------------
  const visibleSec = Math.round((c.visibleMs || 0) / 1000);
  const pointerActivity = (b.mouseMoves || 0) + (b.touches || 0) + (b.wheels || 0);
  if (b.touches > 0) {
    out.push(signal('behavior', 'touch', 'Touch', `${b.touches} touch events`, { human: 5 }));
  }
  if (b.mouseMoves >= 20 && b.strokes > 0) {
    const straight = b.straightStrokes / b.strokes;
    if (straight < 0.7) {
      out.push(signal('behavior', 'mouse-natural', 'Mouse movement', `${b.mouseMoves} moves in ${b.strokes} curvy, irregular strokes`, { human: 7, ai_browser_agent: -2, automation: -2 }));
    } else {
      out.push(signal('behavior', 'mouse-linear', 'Mouse movement', `${Math.round(straight * 100)}% of ${b.strokes} strokes are ruler-straight`, { automation: 4, ai_browser_agent: 3 }));
    }
  } else if (visibleSec >= 6 && pointerActivity === 0) {
    out.push(signal('behavior', 'still', 'Mouse / touch / wheel', `nothing in ${visibleSec}s of visible time`, { ai_browser_agent: 3, automation: 3, human: -1 }));
  }
  if (b.wheels > 0) out.push(signal('behavior', 'wheel', 'Scrolling', `${b.wheels} wheel events`, { human: 2 }));
  else if (b.scrolls > 0 && b.keys === 0 && b.touches === 0) {
    out.push(signal('behavior', 'scroll-programmatic', 'Scrolling', 'page scrolled without wheel, touch or keys', { ai_browser_agent: 2, automation: 2 }));
  }
  if (b.untrusted > 0) {
    out.push(signal('behavior', 'untrusted', 'Synthetic events', `${b.untrusted} events dispatched by script (isTrusted=false)`, { automation: 6, ai_browser_agent: 4, human: -3 }));
  }
  if (b.clicks > 0 && b.clicksWithoutMove === b.clicks) {
    out.push(signal('behavior', 'teleport', 'Clicks', `all ${b.clicks} clicks arrived without any prior pointer movement`, { ai_browser_agent: 4, automation: 4, human: -2 }));
  }
  if (b.centerClicks > 0 && b.centerClicks === b.clicks) {
    out.push(signal('behavior', 'center-click', 'Click precision', `${b.centerClicks}/${b.clicks} clicks hit the exact pixel centre of the button`, { automation: 3, ai_browser_agent: 3, human: -1 }));
  }
  if (b.keys >= 8) {
    if (b.keyIntervalStd > 25) {
      out.push(signal('behavior', 'typing-human', 'Typing rhythm', `${b.keys} keys, irregular rhythm (σ=${Math.round(b.keyIntervalStd)}ms)`, { human: 5 }));
    } else {
      out.push(signal('behavior', 'typing-robotic', 'Typing rhythm', `${b.keys} keys with metronomic timing (σ=${Math.round(b.keyIntervalStd)}ms)`, { automation: 4, ai_browser_agent: 3 }));
    }
  }
  if (b.inputsWithoutKeys > 0) {
    out.push(signal('behavior', 'text-injected', 'Text input', 'text appeared in a field without keystrokes or paste', { ai_browser_agent: 4, automation: 4 }));
  } else if (b.pastes > 0 && b.keys < 3) {
    out.push(signal('behavior', 'paste-only', 'Text input', `text was pasted (${b.pastes}×) rather than typed`, { ai_browser_agent: 2, human: 1 }));
  }
  if (b.firstInteractionMs !== null && b.firstInteractionMs !== undefined && b.firstInteractionMs < 250) {
    out.push(signal('behavior', 'instant', 'Reaction time', `first interaction after ${b.firstInteractionMs}ms`, { automation: 3, ai_browser_agent: 1 }));
  }
  if (b.longPauses >= 2 && b.mouseMoves < 10) {
    out.push(signal('behavior', 'think-pauses', 'Action rhythm', `${b.longPauses} motionless 1.5–20s pauses between actions (model "thinking" time)`, { ai_browser_agent: 4 }, { aiEvidence: true }));
  }
  if (b.focusChanges > 0) out.push(signal('behavior', 'focus', 'Tab switching', `left and came back ${b.focusChanges}×`, { human: 1 }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Visit events: beacons, traps and self-declaration
// ---------------------------------------------------------------------------------------------
export function eventSignals(visit, now = Date.now()) {
  const out = [];
  const types = new Set((visit.events || []).map((e) => e.type));
  const ranJs = Boolean(visit.clientFacts);
  const ageSec = (now - visit.createdAt) / 1000;

  if (!ranJs) {
    if (types.has('css') || types.has('img')) {
      out.push(signal('trap', 'subresources-no-js', 'Page rendering', 'loaded our CSS/image beacons but never ran JavaScript', { automation: 1, preview_bot: 1, human: 1 }));
    } else if (ageSec > 8) {
      out.push(signal('trap', 'html-only', 'Page rendering', 'fetched only the HTML: no CSS, no images, no JavaScript', { script: 2, ai_user_fetcher: 2, ai_retrieval: 2, crawler: 1, ai_training: 1, ai_search: 1, human: -4, automation: -2, ai_browser_agent: -2 }));
    }
  }
  if (types.has('hidden_instruction')) {
    out.push(signal('trap', 'hidden-instruction', 'Hidden instruction', 'followed a note that exists only in the page source (invisible to humans)', ranJs ? { ai_browser_agent: 10, human: -6 } : { ai_user_fetcher: 10, ai_retrieval: 4, human: -6 }, { aiEvidence: true }));
  }
  if (types.has('hidden_link')) {
    out.push(signal('trap', 'hidden-link', 'Invisible link', 'followed a link that is invisible and disallowed in robots.txt', { crawler: 4, scanner: 3, seo_crawler: 2, script: 2, human: -5 }));
  }

  const d = visit.declaration;
  if (d?.role === 'human') out.push(signal('interaction', 'declared-human', 'You told us', 'I am a human', { human: 4 }));
  if (d?.role === 'ai_agent') out.push(signal('interaction', 'declared-agent', 'You told us', `I am an AI agent${d.task ? `: "${d.task}"` : ''}`, ranJs ? { ai_browser_agent: 8 } : { ai_user_fetcher: 8 }, { aiEvidence: true }));
  if (d?.role === 'crawler') out.push(signal('interaction', 'declared-crawler', 'You told us', 'I am a crawler / bot', { crawler: 6 }));
  if (d?.role === 'other') out.push(signal('interaction', 'declared-other', 'You told us', d.task ? `something else: "${d.task}"` : 'something else', {}));
  return out;
}

function safeHost(uri) {
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}
const short = (s) => (s ? `${String(s).slice(0, 10)}…` : '?');
