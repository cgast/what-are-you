// Browser-side evidence collector. Collects raw facts only; all interpretation happens on the
// server (src/detect/signals.js), which returns the re-rendered verdict.

const { visit, token } = document.body.dataset;
const verdictEl = document.getElementById('verdict');
const t0 = performance.now();

// ------------------------------------------------------------------------------------------
// Static environment facts
// ------------------------------------------------------------------------------------------
const AUTOMATION_GLOBALS = [
  '__playwright__binding__', '__pwInitScripts', '__playwright_evaluation_script__', '__puppeteer_evaluation_script__',
  '_phantom', 'callPhantom', '__nightmare', 'domAutomation', 'domAutomationController', '_selenium', '__selenium_unwrapped',
  '__webdriver_evaluate', '__driver_evaluate', '__webdriver_script_fn', '__fxdriver_unwrapped', '_Selenium_IDE_Recorder',
  '__lastWatirAlert', 'Cypress', '__cypress', 'awesomium', '_WEBDRIVER_ELEM_CACHE', '__webdriverFunc',
];

function automationGlobals() {
  const found = AUTOMATION_GLOBALS.filter((k) => k in window);
  for (const k of Object.keys(document)) if (/^\$?cdc_|^\$wdc_/.test(k)) found.push(`document.${k}`);
  for (const k of Object.keys(window)) if (/^cdc_[a-zA-Z0-9]{22}_/.test(k)) found.push(k);
  return [...new Set(found)];
}

function webgl() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    };
  } catch {
    return null;
  }
}

// Classic CDP check: with the DevTools Runtime domain enabled, console.debug serialises the
// argument and touches the getter. Weakened in recent V8 versions, still worth a look.
let cdpDetected = false;
try {
  const probe = new Error('');
  Object.defineProperty(probe, 'stack', { configurable: true, get() { cdpDetected = true; return ''; } });
  console.debug(probe);
} catch { /* ignore */ }

let notification = null;
(async () => {
  try {
    if ('Notification' in window && navigator.permissions) {
      const q = await navigator.permissions.query({ name: 'notifications' });
      notification = { permission: Notification.permission, query: q.state };
    }
  } catch { /* ignore */ }
})();

const staticFacts = {
  ua: navigator.userAgent,
  uaData: navigator.userAgentData
    ? { brands: navigator.userAgentData.brands.map((b) => `${b.brand} ${b.version}`), mobile: navigator.userAgentData.mobile, platform: navigator.userAgentData.platform }
    : null,
  webdriver: navigator.webdriver === true,
  languages: Array.from(navigator.languages || []),
  plugins: navigator.plugins?.length ?? null,
  hwConcurrency: navigator.hardwareConcurrency ?? null,
  deviceMemory: navigator.deviceMemory ?? null,
  maxTouchPoints: navigator.maxTouchPoints ?? null,
  chromeObj: typeof window.chrome === 'object' && window.chrome !== null,
  automationGlobals: automationGlobals(),
  webgl: webgl(),
  window: {
    inner: [window.innerWidth, window.innerHeight],
    outer: [window.outerWidth, window.outerHeight],
    screen: [screen.width, screen.height],
    dpr: window.devicePixelRatio,
  },
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// ------------------------------------------------------------------------------------------
// Behaviour
// ------------------------------------------------------------------------------------------
const b = {
  mouseMoves: 0, strokes: 0, straightStrokes: 0, touches: 0, wheels: 0, scrolls: 0, keys: 0, keyIntervalStd: 0,
  pastes: 0, inputsWithoutKeys: 0, clicks: 0, clicksWithoutMove: 0, centerClicks: 0, untrusted: 0,
  firstInteractionMs: null, longPauses: 0, focusChanges: 0,
};
let visibleMs = 0;
let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
let lastMoveAt = -Infinity;
let lastTouchAt = -Infinity;
let lastKeyAt = -Infinity;
let lastAction = null; // { at, moves }
let stroke = null; // { points: [[x,y]], length }
const keyIntervals = [];

const now = () => performance.now();
const firstInteraction = () => {
  if (b.firstInteractionMs === null) b.firstInteractionMs = Math.round(now() - t0);
};
const countUntrusted = (e) => {
  if (!e.isTrusted) b.untrusted++;
  return e.isTrusted;
};

function endStroke() {
  if (!stroke || stroke.points.length < 3 || stroke.length < 30) return (stroke = null);
  const [x0, y0] = stroke.points[0];
  const [x1, y1] = stroke.points[stroke.points.length - 1];
  const direct = Math.hypot(x1 - x0, y1 - y0);
  b.strokes++;
  if (direct / stroke.length > 0.98) b.straightStrokes++;
  stroke = null;
}

function action() {
  const t = now();
  if (lastAction) {
    const gap = t - lastAction.at;
    if (gap >= 1500 && gap <= 20000 && b.mouseMoves === lastAction.moves) b.longPauses++;
  }
  lastAction = { at: t, moves: b.mouseMoves };
  scheduleSend(1200);
}

const opts = { capture: true, passive: true };
addEventListener('mousemove', (e) => {
  if (!countUntrusted(e)) return;
  firstInteraction();
  const t = now();
  b.mouseMoves++;
  if (!stroke || t - lastMoveAt > 150) {
    endStroke();
    stroke = { points: [[e.clientX, e.clientY]], length: 0 };
  } else {
    const [px, py] = stroke.points[stroke.points.length - 1];
    stroke.length += Math.hypot(e.clientX - px, e.clientY - py);
    stroke.points.push([e.clientX, e.clientY]);
  }
  lastMoveAt = t;
}, opts);

addEventListener('touchstart', (e) => {
  if (!countUntrusted(e)) return;
  firstInteraction();
  b.touches++;
  lastTouchAt = now();
}, opts);
addEventListener('wheel', (e) => {
  if (!countUntrusted(e)) return;
  firstInteraction();
  b.wheels++;
}, opts);
addEventListener('scroll', () => b.scrolls++, opts);

addEventListener('click', (e) => {
  if (!countUntrusted(e) || e.detail === 0) return; // detail 0 = keyboard-activated
  firstInteraction();
  endStroke();
  b.clicks++;
  const t = now();
  if (t - lastMoveAt > 1000 && t - lastTouchAt > 1000) b.clicksWithoutMove++;
  const target = e.target instanceof Element ? e.target.closest('button, a, input, textarea, select, [role="button"]') : null;
  if (target) {
    const r = target.getBoundingClientRect();
    if (Math.abs(e.clientX - (r.left + r.width / 2)) <= 1 && Math.abs(e.clientY - (r.top + r.height / 2)) <= 1) b.centerClicks++;
  }
  action();
}, opts);

addEventListener('keydown', (e) => {
  if (!countUntrusted(e)) return;
  firstInteraction();
  const t = now();
  if (t - lastKeyAt < 2000) keyIntervals.push(t - lastKeyAt);
  else action();
  lastKeyAt = t;
  b.keys++;
  if (keyIntervals.length > 1) {
    const mean = keyIntervals.reduce((a, x) => a + x, 0) / keyIntervals.length;
    b.keyIntervalStd = Math.sqrt(keyIntervals.reduce((a, x) => a + (x - mean) ** 2, 0) / keyIntervals.length);
  }
}, opts);

addEventListener('paste', (e) => {
  if (!countUntrusted(e)) return;
  b.pastes++;
  action();
}, opts);
addEventListener('input', (e) => {
  if (!countUntrusted(e)) return;
  if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') return;
  if (e.inputType?.startsWith('insert') && now() - lastKeyAt > 500) b.inputsWithoutKeys++;
}, opts);
for (const type of ['mousedown', 'pointerdown', 'keyup', 'submit']) addEventListener(type, countUntrusted, opts);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (visibleSince !== null) visibleMs += now() - visibleSince;
    visibleSince = null;
    send('hidden', { beacon: true });
  } else {
    visibleSince = now();
    b.focusChanges++;
  }
});

// ------------------------------------------------------------------------------------------
// Reporting
// ------------------------------------------------------------------------------------------
const currentVisibleMs = () => Math.round(visibleMs + (visibleSince !== null ? now() - visibleSince : 0));
const facts = () => ({ ...staticFacts, cdp: cdpDetected, notification, visibleMs: currentVisibleMs(), behavior: { ...b } });

let inflight = false;
let lastSent = 0;
let timer = null;

function scheduleSend(delay) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    send('activity');
  }, Math.max(delay, 2000 - (now() - lastSent)));
}

async function send(reason, { declaration = null, beacon = false } = {}) {
  const payload = JSON.stringify({ t: token, facts: facts(), declaration, reason });
  if (beacon) {
    navigator.sendBeacon?.(`/api/observe/${visit}`, new Blob([payload], { type: 'application/json' }));
    return;
  }
  if (inflight && !declaration) return;
  inflight = true;
  lastSent = now();
  try {
    const res = await fetch(`/api/observe/${visit}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
    if (res.ok) {
      const data = await res.json();
      verdictEl.innerHTML = data.html; // server-rendered, escaped fragment
    }
  } catch { /* offline; try again later */ } finally {
    inflight = false;
  }
}

for (const delay of [1200, 6000, 15000, 30000]) setTimeout(() => send('scheduled'), delay);

// Progressive enhancement of the "tell us who you are" form (works without JS as a GET form).
const form = document.getElementById('declare-form');
form?.addEventListener('submit', (e) => {
  e.preventDefault();
  const role = e.submitter?.value;
  if (!role) return;
  const task = form.querySelector('textarea').value;
  if (task && b.keys === 0 && b.pastes === 0 && b.inputsWithoutKeys === 0) b.inputsWithoutKeys++; // value set by script
  form.querySelectorAll('button').forEach((btn) => btn.classList.toggle('chosen', btn === e.submitter));
  document.querySelector('#interact h2').textContent = 'Thanks for telling us';
  send('declare', { declaration: { role, task } });
});

// Live sensor panel
const sensors = document.getElementById('sensors');
if (sensors) {
  sensors.hidden = false;
  const show = {
    mouseMoves: () => b.mouseMoves,
    strokes: () => `${b.strokes} (${b.straightStrokes})`,
    clicks: () => `${b.clicks} (${b.clicksWithoutMove})`,
    keys: () => `${b.keys} / ${b.pastes}`,
    wheels: () => `${b.wheels} / ${b.scrolls} / ${b.touches}`,
    untrusted: () => b.untrusted,
    visible: () => `${Math.round(currentVisibleMs() / 1000)}s`,
  };
  const cells = [...sensors.querySelectorAll('dd[data-k]')];
  setInterval(() => cells.forEach((dd) => (dd.textContent = show[dd.dataset.k]())), 500);
}
