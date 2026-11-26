# what are you?

A welcome page that works out **what kind of visitor you are** and shows its evidence. Possible answers:
human, AI agent driving a browser, AI assistant fetching for a person, AI search indexer, AI training crawler,
AI retrieval service, search engine crawler, SEO crawler, link-preview bot, monitor, security scanner, signed bot,
automated browser, script/HTTP client, or impersonator.

Every verdict lists the signals behind it, how much each one counted, and which other answers were close.
Agents get Markdown (`Accept: text/markdown`), JSON (`?format=json`) and a URL they can call to declare who they are and what they're doing.

## Research summary (Nov 2026)

| Approach | What it tells you | Notes |
|---|---|---|
| User-Agent lists ([isbot](https://github.com/omrilotan/isbot), [crawler-user-agents](https://github.com/monperrus/crawler-user-agents), [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt)) | Claimed identity | Trivial to fake. AI vendors split into training crawlers (GPTBot, ClaudeBot), search indexers (OAI-SearchBot, Claude-SearchBot, PerplexityBot) and fetchers acting for a user (ChatGPT-User, Claude-User, Perplexity-User) ([Cloudflare bot reference](https://developers.cloudflare.com/ai-crawl-control/reference/bots)) |
| IP lists / forward-confirmed reverse DNS | Verifies claims | Published by Google, Bing, OpenAI, Perplexity and others ([Google](https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot)) |
| [Web Bot Auth](https://blog.cloudflare.com/signed-agents/) (IETF draft, RFC 9421 signatures) | Cryptographic identity | Strongest signal, adoption still limited ([AWS WAF](https://aws.amazon.com/blogs/security/authenticate-legitimate-ai-agent-traffic-with-aws-waf-bot-control), [Fingerprint](https://docs.fingerprint.com/docs/ai-agents)) |
| Browser fingerprinting ([BotD](https://github.com/fingerprintjs/botd), CreepJS, [sannysoft](https://bot.sannysoft.com), [pixelscan](https://pixelscan.net/bot-check)) | Headless / automation | Test pages for scraper developers; bot or not, no intent. The CDP leak check has weakened ([Castle](https://blog.castle.io/why-a-classic-cdp-bot-detection-signal-suddenly-stopped-working-and-nobody-noticed/)) |
| Behavioural telemetry | AI agent vs human | Agents barely move the mouse, jump to targets, and pause while "thinking" ([Akamai](https://www.akamai.com/blog/security-research/2026/aug/identifying-agentic-automation-behavioral-telemetry), [cside](https://cside.com/blog/catching-ai-agents-behavioral-signals)) |
| Honeypots / hidden instructions | LLM in the loop | Text only a model reads and acts on ([USENIX Sec '25 "Cloak, Honey, Trap"](https://usenix.org/conference/usenixsecurity25/presentation/ayzenshteyn)) |
| TLS fingerprints (JA4) | Real client stack | Not used: TLS ends at Traefik ([intro](https://botoi.com/blog/detect-ai-scrapers-tls-fingerprint/)) |

Commercial products (Cloudflare, DataDome, Fingerprint, Akamai, HUMAN) combine all of these, but none of them is a self-hosted page that explains its verdict, so this one does.

## How it works

```
request ──► src/detect/request.js   facts: UA, headers, IP lists, rDNS, Web Bot Auth (verified)
browser ──► public/probe.js         facts: fingerprints + behaviour summary  ──► POST /api/observe/:id
events  ──► beacons (css/img), hidden link, hidden instruction, self-declaration
                │
                ▼
        src/detect/signals.js       facts → weighted signals (all weights live here)
        src/detect/classify.js      signals → softmax verdict, verified-identity override,
                                    "automated + AI evidence ⇒ AI agent" promotion
```

* **Source of truth for data:** `src/data/agents.js` (user agents, verification methods, IP lists) and `src/data/categories.js`.
* Raw facts are stored per visit, so the verdict is recomputed as new evidence arrives. There is one renderer (`src/views/verdict.js`) for both server HTML and live updates.
* Each visit has a capability token, so only the visitor who received the page can add evidence to it.
* Privacy: no cookies, no third-party requests, IPs are stored only as keyed hashes, and visits are deleted after `RETENTION_DAYS`.

## Run locally

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

Requires Node ≥ 22.13 (uses built-in `node:sqlite`).

## Deploy on Coolify (Hetzner)

1. In Coolify, create a new resource from this Git repository and choose the **Docker Compose** build pack.
2. On the `app` service, set your domain (e.g. `https://whatareyou.example.com`) and port **3000**.
3. Set environment variables:
   * `PUBLIC_URL`: the same domain, used in links handed to agents.
   * `TRUST_PROXY_HOPS`: `1` for Coolify's Traefik. Use `2` if Cloudflare (or another proxy) sits in front.
   * `APP_SECRET` (optional): otherwise one is generated and kept in the volume.
4. Deploy. Data is stored in the `what-are-you-data` volume (`/data`).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `PUBLIC_URL` | derived from request | Absolute links for agents |
| `TRUST_PROXY_HOPS` | 0 (compose: 1) | Proxies whose `X-Forwarded-*` headers are trusted |
| `DATA_DIR` | `./data` (image: `/data`) | SQLite location |
| `APP_SECRET` | generated | HMAC key for tokens and IP hashes |
| `RETENTION_DAYS` | 30 | Visit retention |
| `NETWORK_BUDGET_MS` | 1500 | Time budget for rDNS and signature checks per page |
| `FETCH_IP_LISTS` | true | Load vendor IP range lists (refreshed every 12h) |
| `API_RATE_PER_MINUTE` | 60 | Per-IP limit for the observe API |

## Limits

Any signal can be forged, and agents running inside a person's own browser (extension-based agents) look like that person apart from their behaviour.
The weights in `signals.js` are hand-tuned starting values. Use `/stats` and self-declarations to calibrate them.
