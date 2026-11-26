import { CATEGORIES } from '../data/categories.js';
import { html } from '../lib/html.js';
import { layout } from './layout.js';

const TECHNIQUES = [
  ['User-Agent matching', 'Compared against a curated list of ~100 crawlers, AI fetchers, scanners and HTTP libraries. Anyone can fake a user agent, so on its own it only counts as a claim.', 'https://github.com/ai-robots-txt/ai.robots.txt'],
  ['Claim verification', 'If you claim to be Googlebot, GPTBot, ChatGPT-User, PerplexityBot and so on, we check your IP against the vendor\'s published ranges or use forward-confirmed reverse DNS. If the claim fails, you are flagged as an impersonator.', 'https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot'],
  ['Web Bot Auth', 'Cryptographic agent identity (IETF draft, RFC 9421 HTTP Message Signatures). We fetch the key directory named in your Signature-Agent header and verify your Ed25519 signature.', 'https://blog.cloudflare.com/signed-agents/'],
  ['Header consistency', 'Real browsers send Sec-Fetch-*, client hints, Accept-Language and modern encodings. Scripts that copy a Chrome user agent usually forget these.', 'https://developer.mozilla.org/en-US/docs/Glossary/Fetch_metadata_request_header'],
  ['Rendering beacons', 'A per-visit stylesheet, an image and our script tell us whether you rendered the page, loaded subresources, or only fetched the HTML text, which is typical of LLM fetch tools.', null],
  ['Automation fingerprints', 'navigator.webdriver, headless user agents, Playwright/Puppeteer/Selenium globals, the DevTools protocol, software WebGL, default viewports and permission quirks. These are similar to the open-source BotD checks.', 'https://github.com/fingerprintjs/BotD'],
  ['Behaviour', 'Agents rarely move the mouse, jump straight to their targets, click exact element centres, insert text without keystrokes and pause for seconds while the model "thinks". Humans wiggle.', 'https://www.akamai.com/blog/security-research/2026/aug/identifying-agentic-automation-behavioral-telemetry'],
  ['Hidden instruction', 'The page source contains a note addressed to AI agents that humans never see. Only something that reads and acts on raw page text will follow it.', 'https://usenix.org/conference/usenixsecurity25/presentation/ayzenshteyn'],
  ['Invisible link', 'A link that is invisible, aria-hidden and disallowed in robots.txt. Visitors that follow every link find it, and humans never do.', null],
  ['Asking', 'We simply ask. A claim is weak evidence, but combined with behaviour it is useful, and well-behaved agents are happy to say who they are.', null],
];

export function aboutPage() {
  return layout({
    title: 'How it works · What are you?',
    body: html`
    <section class="card prose">
      <h1>How it works</h1>
      <p>Every visit is scored against ${Object.keys(CATEGORIES).length - 1} hypotheses, from human to AI browser agent to security scanner.
      Each observation adds or subtracts points for some hypotheses. The scores go through a softmax to give the confidence you see.
      A verified identity (a valid Web Bot Auth signature, or a crawler confirmed by IP or DNS) overrides the heuristics.</p>
      <h2>Techniques</h2>
      <dl class="techniques">${TECHNIQUES.map(
        ([name, text, src]) => html`<dt>${name}</dt><dd>${text}${src ? html` <a href="${src}">Source</a>` : ''}</dd>`,
      )}</dl>
      <h2>Limits</h2>
      <p>Everything a client sends can be forged, and a determined bot can imitate a human. AI agents running inside a person's own browser
      (extensions such as Claude in Chrome) look almost exactly like that person, apart from their behaviour. TLS fingerprints (JA4) would help,
      but the TLS connection ends at the reverse proxy. Treat the verdict as a well-argued guess, not a fact.</p>
      <h2>Categories</h2>
      <dl class="techniques">${Object.entries(CATEGORIES)
        .filter(([id]) => id !== 'unknown')
        .map(([, c]) => html`<dt>${c.icon} ${c.label}</dt><dd>${c.intent}</dd>`)}</dl>
      <h2 id="privacy">Privacy</h2>
      <p>For each visit we store the request facts listed on your result (User-Agent, selected headers, the network's domain), the browser and behaviour
      summaries, and your answer if you give one. IP addresses are stored only as keyed hashes, and visits are deleted after the retention period.
      There are no cookies and no third-party requests.</p>
    </section>`,
  });
}

export function statsPage({ windows }) {
  return layout({
    title: 'Stats · What are you?',
    body: html`
    <section class="card prose">
      <h1>Who visits?</h1>
      <p class="muted">Final verdict per visit. Visits that never ran JavaScript keep their HTTP-only verdict.</p>
      ${windows.map(
        ({ label, stats }) => html`
        <h2>${label}</h2>
        ${stats.categories.length
          ? html`<table class="stats"><thead><tr><th scope="col">Verdict</th><th scope="col">Visits</th><th scope="col">Share</th></tr></thead><tbody>
            ${(() => {
              const total = stats.categories.reduce((a, r) => a + r.n, 0);
              return stats.categories.map(
                (r) => html`<tr><td>${CATEGORIES[r.category]?.icon || ''} ${CATEGORIES[r.category]?.label || r.category}</td><td>${r.n}</td><td>${Math.round((r.n / total) * 100)}%</td></tr>`,
              );
            })()}</tbody></table>
            ${stats.declared.length ? html`<p class="muted">Self-declared: ${stats.declared.map((d, i) => html`${i ? ', ' : ''}${d.role} ${d.n}`)}</p>` : ''}`
          : html`<p class="muted">No visits yet.</p>`}`,
      )}
    </section>`,
  });
}
