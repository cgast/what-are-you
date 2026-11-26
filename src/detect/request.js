// Collects server-side *facts* about an incoming request. Interpretation happens in signals.js.
// Facts are stored with the visit so verdicts can be recomputed when new evidence arrives.

import { matchAgent } from '../data/agents.js';
import { ipInList, ipListMatches, ipListStatus, networkKind, reverseDns, withBudget } from './network.js';
import { checkWebBotAuth } from './webBotAuth.js';

const HEADER_FACTS = [
  'accept', 'accept-language', 'accept-encoding', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
  'sec-fetch-user', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'upgrade-insecure-requests',
  'dnt', 'sec-gpc', 'from', 'via', 'purpose', 'sec-purpose', 'x-requested-with', 'priority',
];

/** Last two DNS labels, enough to show the network without storing a per-subscriber hostname. */
const domainOf = (hostname) => hostname?.split('.').filter(Boolean).slice(-2).join('.') || null;

async function verifyClaim(agent, ip, rdnsPromise) {
  const spec = agent?.verify;
  if (!spec) return agent ? { agentId: agent.id, result: 'unverifiable', detail: `${agent.operator} publishes no IP list or reverse-DNS domain for this client` } : null;

  if (spec.ipList && ipListStatus(spec.ipList) === 'loaded') {
    const inList = ipInList(spec.ipList, ip);
    if (inList) return { agentId: agent.id, method: 'ip-list', result: 'verified', detail: `address is in ${agent.operator}'s published ${spec.ipList} ranges` };
    if (!spec.rdns) return { agentId: agent.id, method: 'ip-list', result: 'failed', detail: `address is not in ${agent.operator}'s published ${spec.ipList} ranges` };
  }
  if (spec.rdns) {
    const rdns = await rdnsPromise;
    if (rdns.transient) return { agentId: agent.id, method: 'rdns', result: 'unknown', detail: rdns.reason };
    const ok = rdns.hostname && rdns.confirmed && spec.rdns.some((suffix) => rdns.hostname.endsWith(suffix));
    return {
      agentId: agent.id,
      method: 'rdns',
      result: ok ? 'verified' : 'failed',
      detail: ok
        ? `${rdns.hostname} is in ${spec.rdns.join(' / ')} and resolves back to this address`
        : `reverse DNS ${rdns.hostname ? `is ${rdns.hostname}${rdns.confirmed ? '' : ' (not forward-confirmed)'}` : 'has no record'}; expected ${spec.rdns.join(' / ')}`,
    };
  }
  return { agentId: agent.id, result: 'unknown', detail: `${agent.operator}'s IP list could not be loaded` };
}

/**
 * @param {object} req { method, path, targetUri, headers: Headers, ip, secure }
 * @param {number} budgetMs time budget for network lookups
 */
export async function collectRequestFacts(req, budgetMs) {
  const ua = req.headers.get('user-agent') || '';
  const headers = {};
  for (const name of HEADER_FACTS) {
    const value = req.headers.get(name);
    if (value !== null) headers[name] = value.slice(0, 300);
  }

  const agent = matchAgent(ua);
  const rdnsPromise = reverseDns(req.ip);
  const timeout = { hostname: null, reason: 'lookup exceeded time budget', transient: true };

  const [rdns, verification, webBotAuth] = await Promise.all([
    withBudget(rdnsPromise, budgetMs, timeout),
    withBudget(verifyClaim(agent, req.ip, withBudget(rdnsPromise, budgetMs, timeout)), budgetMs + 100, {
      agentId: agent?.id,
      result: 'unknown',
      detail: 'verification exceeded time budget',
    }),
    withBudget(checkWebBotAuth(req), budgetMs * 2, { present: true, verified: false, error: 'verification exceeded time budget' }),
  ]);

  const kind = networkKind(rdns.hostname);
  return {
    at: Date.now(),
    method: req.method,
    path: req.path,
    secure: req.secure,
    ua: ua.slice(0, 500),
    headers,
    network: {
      ipVersion: req.ip.includes(':') ? 6 : 4,
      ipLists: ipListMatches(req.ip),
      rdnsDomain: verification?.method === 'rdns' && verification.result === 'verified' ? rdns.hostname : domainOf(rdns.hostname),
      rdnsConfirmed: rdns.confirmed ?? null,
      kind,
    },
    verification,
    webBotAuth,
  };
}
