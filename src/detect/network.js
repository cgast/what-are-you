// Network-level facts: published crawler IP ranges and forward-confirmed reverse DNS.

import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';
import { IP_LISTS } from '../data/agents.js';
import { IpRangeSet } from '../lib/ip.js';
import { fetchJson, TtlCache } from '../lib/safeFetch.js';

const REFRESH_MS = 12 * 60 * 60 * 1000;
const ipLists = new Map(); // listId -> { ranges: IpRangeSet, loadedAt } | { error }

export function parsePrefixList(json) {
  const prefixes = Array.isArray(json?.prefixes) ? json.prefixes : [];
  return new IpRangeSet(prefixes.map((p) => p.ipv4Prefix || p.ipv6Prefix).filter(Boolean));
}

async function loadList(id, url) {
  try {
    const ranges = parsePrefixList(await fetchJson(url, { timeoutMs: 10_000 }));
    if (!ranges.size) throw new Error('no prefixes in list');
    ipLists.set(id, { ranges, loadedAt: Date.now() });
  } catch (error) {
    // Keep a previously loaded list if a refresh fails.
    if (!ipLists.get(id)?.ranges) ipLists.set(id, { error: error.message });
    console.warn(`[ip-lists] ${id}: ${error.message}`);
  }
}

export async function startIpListRefresh() {
  if (!config.fetchIpLists) return;
  const refresh = () => Promise.all(Object.entries(IP_LISTS).map(([id, url]) => loadList(id, url)));
  await refresh();
  setInterval(refresh, REFRESH_MS).unref();
}

/** For tests and offline setups. */
export function setIpList(id, cidrs) {
  ipLists.set(id, { ranges: new IpRangeSet(cidrs), loadedAt: Date.now() });
}

export function ipListStatus(id) {
  const entry = ipLists.get(id);
  return entry?.ranges ? 'loaded' : 'unavailable';
}

/** All lists the IP belongs to. */
export function ipListMatches(ip) {
  const out = [];
  for (const [id, entry] of ipLists) if (entry.ranges?.has(ip)) out.push(id);
  return out;
}

export function ipInList(id, ip) {
  const entry = ipLists.get(id);
  return entry?.ranges ? entry.ranges.has(ip) : null; // null = unknown
}

const rdnsCache = new TtlCache({ ttlMs: 60 * 60 * 1000, errorTtlMs: 5 * 60 * 1000, max: 5000 });

/**
 * Forward-confirmed reverse DNS: PTR lookup, then the hostname must resolve back to the IP.
 * Returns { hostname, confirmed } or { hostname: null, reason }.
 */
export function reverseDns(ip) {
  if (!net.isIP(ip)) return Promise.resolve({ hostname: null, reason: 'no ip' });
  return rdnsCache
    .get(ip, async () => {
      let names;
      try {
        names = await dns.reverse(ip);
      } catch (error) {
        if (error.code === 'ENOTFOUND') return { hostname: null, reason: 'no PTR record' };
        throw error;
      }
      const hostname = names[0];
      if (!hostname) return { hostname: null, reason: 'no PTR record' };
      const resolver = net.isIPv6(ip) ? dns.resolve6 : dns.resolve4;
      const forward = await resolver(hostname).catch(() => []);
      return { hostname, confirmed: forward.includes(ip) };
    })
    .catch((error) => ({ hostname: null, reason: `lookup failed (${error.code || error.message})`, transient: true }));
}

// Hostname patterns that hint at the kind of network a visitor comes from.
const DATACENTER_HINTS = /amazonaws\.com|googleusercontent\.com|cloudapp\.|azure|compute|your-server\.de|hetzner|ovh\.|digitalocean|linode|akamai|vultr|scaleway|contabo|oraclecloud|hosted|server|vps|cloud/i;
const RESIDENTIAL_HINTS = /dsl|dyn(amic)?|pool|dial|cable|fiber|fibre|ftth|broadband|customer|residential|dip\d*\.t-ipconnect|versanet|vodafone|telekom|comcast|verizon|\.res\.|mobile|wireless|lte|5g/i;

export function networkKind(hostname) {
  if (!hostname) return null;
  if (DATACENTER_HINTS.test(hostname)) return 'datacenter';
  if (RESIDENTIAL_HINTS.test(hostname)) return 'residential';
  return null;
}

/** Race a promise against a time budget; resolves to `fallback` on timeout. */
export function withBudget(promise, ms, fallback) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}
