import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyVisit } from '../src/detect/classify.js';
import { matchAgent } from '../src/data/agents.js';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const browserHeaders = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'sec-fetch-site': 'none',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-user': '?1',
  'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"',
};
const requestFacts = (over = {}) => ({ ua: CHROME, headers: browserHeaders, secure: true, network: { ipLists: [] }, verification: null, webBotAuth: { present: false }, ...over });
const clientFacts = (over = {}, behavior = {}) => ({
  ua: CHROME, webdriver: false, languages: ['en-US'], plugins: 5, chromeObj: true, automationGlobals: [], cdp: false,
  webgl: { vendor: 'Apple', renderer: 'Apple M2' }, window: { inner: [1440, 800], outer: [1440, 900] }, visibleMs: 12000,
  behavior: { mouseMoves: 0, strokes: 0, straightStrokes: 0, touches: 0, wheels: 0, scrolls: 0, keys: 0, keyIntervalStd: 0, pastes: 0,
    inputsWithoutKeys: 0, clicks: 0, clicksWithoutMove: 0, centerClicks: 0, untrusted: 0, firstInteractionMs: null, longPauses: 0, focusChanges: 0, ...behavior },
  ...over,
});
const visit = (over = {}) => ({ createdAt: Date.now() - 60_000, requestFacts: requestFacts(), clientFacts: null, events: [], declaration: null, ...over });

test('agent list: specific tokens win over generic ones', () => {
  assert.equal(matchAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)').id, 'chatgpt-user');
  assert.equal(matchAgent('Claude-User (claude-code/2.1; +https://support.anthropic.com/)').id, 'claude-code');
  assert.equal(matchAgent('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)').id, 'claudebot');
  assert.equal(matchAgent('curl/8.5.0').id, 'curl');
  assert.equal(matchAgent(CHROME), null);
});

test('human: real browser with natural mouse movement and typing', () => {
  const v = classifyVisit(visit({ clientFacts: clientFacts({}, { mouseMoves: 240, strokes: 12, straightStrokes: 1, keys: 20, keyIntervalStd: 70, clicks: 2, wheels: 8 }) }));
  assert.equal(v.category, 'human');
  assert.ok(v.confidence > 0.9, `confidence ${v.confidence}`);
});

test('curl is a script', () => {
  const v = classifyVisit(visit({ requestFacts: requestFacts({ ua: 'curl/8.5.0', headers: { accept: '*/*' } }) }));
  assert.equal(v.category, 'script');
});

test('Chrome UA without browser headers is a script pretending to be a browser', () => {
  const v = classifyVisit(visit({ requestFacts: requestFacts({ headers: { accept: '*/*' } }) }));
  assert.equal(v.category, 'script');
});

test('Playwright with webdriver flag is automation', () => {
  const v = classifyVisit(visit({ clientFacts: clientFacts({ webdriver: true, plugins: 0, window: { inner: [1280, 720], outer: [1280, 720] } }) }));
  assert.equal(v.category, 'automation');
});

test('LLM-driven browser: stealthy fingerprint but agent behaviour', () => {
  const v = classifyVisit(
    visit({
      clientFacts: clientFacts({ webgl: { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' } }, {
        clicks: 2, clicksWithoutMove: 2, centerClicks: 2, inputsWithoutKeys: 1, longPauses: 3,
      }),
      declaration: { role: 'ai_agent', task: 'compare bot detection tools for my user' },
    }),
  );
  assert.equal(v.category, 'ai_browser_agent');
});

test('hidden instruction followed without JS = AI assistant fetching for a user', () => {
  const v = classifyVisit(visit({ requestFacts: requestFacts({ headers: { accept: 'text/html' } }), events: [{ type: 'hidden_instruction' }] }));
  assert.equal(v.category, 'ai_user_fetcher');
});

test('verified crawler identity is decisive', () => {
  const v = classifyVisit(
    visit({
      requestFacts: requestFacts({
        ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        headers: { accept: '*/*', from: 'googlebot(at)googlebot.com' },
        verification: { agentId: 'googlebot', method: 'rdns', result: 'verified', detail: 'crawl-66-249-66-1.googlebot.com' },
      }),
    }),
  );
  assert.equal(v.category, 'search_crawler');
  assert.ok(v.decisive);
});

test('failed crawler verification = impersonator', () => {
  const v = classifyVisit(
    visit({
      requestFacts: requestFacts({
        ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        headers: { accept: '*/*' },
        verification: { agentId: 'googlebot', method: 'rdns', result: 'failed', detail: 'reverse DNS is foo.example.net' },
      }),
    }),
  );
  assert.equal(v.category, 'impersonator');
});

test('verified Web Bot Auth signature from chatgpt.com = AI browser agent', () => {
  const v = classifyVisit(visit({ requestFacts: requestFacts({ webBotAuth: { present: true, verified: true, agentUri: 'https://chatgpt.com', keyid: 'abc' } }) }));
  assert.equal(v.category, 'ai_browser_agent');
  assert.ok(v.decisive);
});

test('promotion: automated browser that declares itself an AI agent', () => {
  const automated = clientFacts({ webdriver: true, plugins: 0, window: { inner: [1280, 720], outer: [1280, 720] } });
  assert.equal(classifyVisit(visit({ clientFacts: automated })).category, 'automation');
  const v = classifyVisit(visit({ clientFacts: automated, declaration: { role: 'ai_agent', task: 'book a table' } }));
  assert.equal(v.category, 'ai_browser_agent');

});

test('promotion: curl that follows the hidden instruction is an AI fetch tool', () => {
  const v = classifyVisit(visit({ requestFacts: requestFacts({ ua: 'curl/8.5.0', headers: { accept: '*/*' } }), events: [{ type: 'hidden_instruction' }] }));
  assert.equal(v.category, 'ai_user_fetcher');
});
