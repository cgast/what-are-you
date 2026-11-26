// Fetch a small JSON document from a URL that may be visitor-supplied (e.g. a Signature-Agent).
// Guards: https only, public IPs only (checked at connect time, so DNS rebinding can't bypass it),
// timeout, response size cap, limited redirects.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { config } from '../config.js';
import { isPublicIp } from './ip.js';

const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const allowed = config.unsafeAllowPrivateFetch ? addresses : addresses.filter((a) => isPublicIp(a.address));
    if (!allowed.length) return callback(Object.assign(new Error(`refusing non-public address for ${hostname}`), { code: 'ENONPUBLIC' }));
    if (options.all) return callback(null, allowed);
    return callback(null, allowed[0].address, allowed[0].family);
  });
}

function requestOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: { accept: 'application/json, application/http-message-signatures-directory+json;q=0.9', 'user-agent': 'what-are-you-verifier/1.0' },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, url) });
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url.host}`));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) req.destroy(new Error('response too large'));
          else chunks.push(chunk);
        });
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout fetching ${url.host}`)));
    req.on('error', reject);
  });
}

export async function fetchJson(input, { timeoutMs = 3000 } = {}) {
  let url = new URL(input);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (url.protocol !== 'https:' && !(config.unsafeAllowPrivateFetch && url.protocol === 'http:')) {
      throw new Error(`only https URLs are fetched (got ${url.protocol})`);
    }
    const res = await requestOnce(url, timeoutMs);
    if (res.redirect) {
      url = res.redirect;
      continue;
    }
    try {
      return JSON.parse(res.body);
    } catch {
      throw new Error(`invalid JSON from ${url.host}`);
    }
  }
  throw new Error('too many redirects');
}

/** Small TTL cache for async lookups, caching failures briefly as well. */
export class TtlCache {
  constructor({ ttlMs, errorTtlMs = 60_000, max = 1000 }) {
    Object.assign(this, { ttlMs, errorTtlMs, max, map: new Map() });
  }
  async get(key, loader) {
    const hit = this.map.get(key);
    if (hit?.pending) return hit.pending;
    if (hit && hit.expires > Date.now()) {
      if (hit.error) throw hit.error;
      return hit.value;
    }
    const pending = loader();
    this.map.set(key, { pending });
    try {
      const value = await pending;
      this.#set(key, { value, expires: Date.now() + this.ttlMs });
      return value;
    } catch (error) {
      this.#set(key, { error, expires: Date.now() + this.errorTtlMs });
      throw error;
    }
  }
  #set(key, entry) {
    this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}
