import net from 'node:net';

/** Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 -> 1.2.3.4). */
export function normalizeIp(ip) {
  if (!ip) return '';
  const s = String(ip).trim();
  return s.startsWith('::ffff:') && net.isIPv4(s.slice(7)) ? s.slice(7) : s;
}

const family = (ip) => (net.isIPv6(ip) ? 'ipv6' : 'ipv4');

/**
 * Resolve the client address. With N trusted proxies, the client is the N-th entry from the
 * right of X-Forwarded-For (each proxy appends the address it received the request from).
 * Entries left of that are client-controlled and ignored.
 */
export function clientIp(socketIp, forwardedFor, trustedHops) {
  if (!trustedHops || !forwardedFor) return normalizeIp(socketIp);
  const chain = forwardedFor.split(',').map((x) => normalizeIp(x)).filter(Boolean);
  const candidate = chain[chain.length - trustedHops];
  return candidate && net.isIP(candidate) ? candidate : normalizeIp(socketIp);
}

/** A set of CIDR ranges with fast membership checks. */
export class IpRangeSet {
  constructor(cidrs = []) {
    this.list = new net.BlockList();
    this.size = 0;
    for (const cidr of cidrs) this.add(cidr);
  }
  add(cidr) {
    const [addr, bits] = String(cidr).trim().split('/');
    if (!net.isIP(addr)) return;
    const fam = family(addr);
    const prefix = bits === undefined ? (fam === 'ipv6' ? 128 : 32) : Number(bits);
    this.list.addSubnet(addr, prefix, fam);
    this.size++;
  }
  has(ip) {
    const n = normalizeIp(ip);
    return net.isIP(n) ? this.list.check(n, family(n)) : false;
  }
}

// Addresses we must never fetch from on behalf of a visitor (SSRF protection).
const NON_PUBLIC = new IpRangeSet([
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
  '::/128', '::1/128', '64:ff9b:1::/48', '100::/64', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'ff00::/8',
]);

export const isPublicIp = (ip) => net.isIP(normalizeIp(ip)) !== 0 && !NON_PUBLIC.has(ip);
