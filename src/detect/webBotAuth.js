// Web Bot Auth (IETF webbotauth, RFC 9421 HTTP Message Signatures) verification.
// We fetch the signer's key directory from the Signature-Agent URI and verify the signature
// with Cloudflare's reference implementation (npm: web-bot-auth).

import { HTTP_MESSAGE_SIGNATURES_DIRECTORY, parseSignatureAgentCard, verify } from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';
import { fetchJson, TtlCache } from '../lib/safeFetch.js';

const directoryCache = new TtlCache({ ttlMs: 60 * 60 * 1000, errorTtlMs: 5 * 60 * 1000, max: 500 });

// Replay protection: remember nonces until their signature would have expired anyway.
const seenNonces = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [nonce, exp] of seenNonces) if (exp < now) seenNonces.delete(nonce);
}, 60_000).unref();

function directoryUrl(uri, type) {
  const url = new URL(uri);
  if (type === 'directory' && (url.pathname === '/' || url.pathname === '')) url.pathname = HTTP_MESSAGE_SIGNATURES_DIRECTORY;
  return url.toString();
}

/** Load keys + optional metadata (Signature Agent Card) for a Signature-Agent entry. */
async function loadDirectory(entry) {
  const url = directoryUrl(entry.uri, entry.type);
  return directoryCache.get(url, async () => {
    const doc = await fetchJson(url);
    if (Array.isArray(doc?.keys)) {
      // Plain JWKS; newer directories may also carry card metadata alongside the keys.
      let card = null;
      try {
        card = parseSignatureAgentCard(doc, url);
      } catch {
        /* metadata is optional */
      }
      return { url, keys: doc.keys, card };
    }
    const card = parseSignatureAgentCard(doc, url);
    const keys = card.jwks?.keys || (card.jwks_uri ? (await fetchJson(card.jwks_uri)).keys : null);
    if (!Array.isArray(keys)) throw new Error('directory contains no keys');
    return { url, keys, card };
  });
}

/**
 * @param {{method:string, targetUri:string, headers:Headers}} req
 * @returns facts object (serialisable), never throws
 */
export async function checkWebBotAuth({ method, targetUri, headers }) {
  const signature = headers.get('signature');
  const signatureInput = headers.get('signature-input');
  const signatureAgent = headers.get('signature-agent');
  if (!signature && !signatureInput && !signatureAgent) return { present: false };

  const facts = { present: true, signatureAgent, verified: false };
  let directory = null;
  try {
    const result = await verify(
      { kind: 'request', method, targetUri, fields: [...headers].map(([name, value]) => ({ name, value })) },
      {
        clockSkew: 60,
        resolver: async (candidate) => {
          if (!candidate.signatureAgent) throw new Error('no Signature-Agent header to discover keys from');
          directory = await loadDirectory(candidate.signatureAgent);
          for (const jwk of directory.keys) {
            try {
              const verifier = await verifierFromJWK(jwk);
              if (verifier.keyid === candidate.keyid) return verifier;
            } catch {
              /* unsupported key type; skip */
            }
          }
          throw new Error(`key ${candidate.keyid} not found in signer's directory`);
        },
        validate: ({ nonce, expires }) => {
          if (!nonce) return true;
          if (seenNonces.has(nonce)) return false;
          seenNonces.set(nonce, expires.getTime());
          return true;
        },
      },
    );
    Object.assign(facts, {
      verified: true,
      keyid: result.keyid,
      agentUri: result.signatureAgent?.uri || null,
      expires: result.expires.toISOString(),
    });
  } catch (error) {
    facts.error = error.message;
  }
  if (directory) {
    facts.directoryUrl = directory.url;
    const card = directory.card;
    if (card) {
      facts.card = {
        name: card.client_name || null,
        uri: card.client_uri || null,
        purpose: card.web_bot_auth?.purpose || null,
        trigger: card.web_bot_auth?.trigger || null,
      };
    }
  }
  if (!facts.agentUri && signatureAgent) {
    facts.agentUri = signatureAgent.match(/https?:\/\/[^"\s;,]+/)?.[0] || null;
  }
  return facts;
}
