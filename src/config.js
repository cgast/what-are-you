// Central runtime configuration. Every tunable comes from the environment here and nowhere else.

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = Object.freeze({
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  // Absolute public URL (e.g. https://whatareyou.example.com). Used in links we hand to agents.
  // If empty, it is derived from the request (honouring X-Forwarded-* when behind a trusted proxy).
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),

  // Number of reverse proxies in front of the app (Coolify/Traefik = 1, Cloudflare + Traefik = 2).
  // 0 = use the socket address and ignore X-Forwarded-* headers entirely.
  trustProxyHops: int(process.env.TRUST_PROXY_HOPS, 0),

  dataDir: process.env.DATA_DIR || './data',
  // Optional. If unset, a random secret is generated once and persisted in the database.
  appSecret: process.env.APP_SECRET || '',

  retentionDays: int(process.env.RETENTION_DAYS, 30),

  // Network verification budget for a page render (rDNS, signature directory fetch).
  networkBudgetMs: int(process.env.NETWORK_BUDGET_MS, 1500),

  // Remote IP-range lists of crawlers (see src/data/agents.js). Can be disabled for offline setups.
  fetchIpLists: bool(process.env.FETCH_IP_LISTS, true),

  // Development/testing only: allow http:// and private-network signature directories.
  unsafeAllowPrivateFetch: bool(process.env.UNSAFE_ALLOW_PRIVATE_FETCH, false),

  apiRatePerMinute: int(process.env.API_RATE_PER_MINUTE, 60),
});
