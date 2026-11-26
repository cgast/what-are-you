// Integration: real HTTP server with an in-memory store.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.FETCH_IP_LISTS = 'false';
process.env.NETWORK_BUDGET_MS = '200';
const { serve } = await import('@hono/node-server');
const { createApp } = await import('../src/app.js');
const { openStore } = await import('../src/store/db.js');

let server;
let base;
const store = openStore(':memory:');
before(async () => {
  await new Promise((resolve) => {
    server = serve({ fetch: createApp(store).fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      base = `http://127.0.0.1:${info.port}`;
      resolve();
    });
  });
});
after(() => {
  server.close();
  store.close();
});

const tokenOf = (text) => /\/declare\/([\w-]+)\?t=([\w-]+)/.exec(text).slice(1);

test('curl gets markdown with a declare link', async () => {
  const res = await fetch(`${base}/`, { headers: { 'user-agent': 'curl/8.5.0', accept: '*/*' } });
  assert.match(res.headers.get('content-type'), /text\/markdown/);
  const text = await res.text();
  assert.match(text, /script \/ HTTP client/);
  assert.ok(tokenOf(text));
});

test('browsers get HTML with probe, beacons, trap and hidden note', async () => {
  const res = await fetch(`${base}/`, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36' } });
  const page = await res.text();
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  for (const needle of ['/static/probe.js', '/b/css/', '/b/img/', 'class="trap"', 'class="agent-note"', '/hello-agent/']) assert.ok(page.includes(needle), needle);
});

test('declaring via GET and the hidden instruction update the verdict', async () => {
  const [id, t] = tokenOf(await (await fetch(`${base}/`, { headers: { accept: 'text/markdown', 'user-agent': 'Mozilla/5.0 Chrome/140.0.0.0' } })).text());
  const declared = await (await fetch(`${base}/declare/${id}?t=${t}&role=ai_agent&task=research&format=json`)).json();
  assert.ok(declared.signals.some((s) => s.id === 'declared-agent'));
  const hello = await (await fetch(`${base}/hello-agent/${id}?t=${t}&format=json`)).json();
  assert.equal(hello.category, 'ai_user_fetcher');
});

test('wrong token is rejected', async () => {
  const [id] = tokenOf(await (await fetch(`${base}/`, { headers: { accept: 'text/markdown' } })).text());
  assert.equal((await fetch(`${base}/declare/${id}?t=nope&role=human`)).status, 404);
  const res = await fetch(`${base}/api/observe/${id}`, { method: 'POST', body: JSON.stringify({ t: 'nope', facts: {} }) });
  assert.equal(res.status, 404);
});

test('observe API sanitises facts and returns rendered verdict', async () => {
  const [id, t] = tokenOf(await (await fetch(`${base}/`, { headers: { accept: 'text/markdown' } })).text());
  const res = await fetch(`${base}/api/observe/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t, facts: { ua: 'x', webdriver: true, evil: '<script>', behavior: { clicks: 'NaN' } } }),
  });
  const data = await res.json();
  assert.equal(data.verdict.category, 'automation');
  assert.ok(!data.html.includes('<script>'));
  assert.equal(store.getVisit(id).clientFacts.evil, undefined);
});

test('robots.txt disallows the trap', async () => {
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \/trap\//);
});
