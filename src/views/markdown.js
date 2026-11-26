// Plain-text/Markdown rendering for agents and command-line clients.

import { visitLinks } from './home.js';
import { pct } from './verdict.js';

const signed = (n) => (n > 0 ? `+${n}` : String(n));
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');

export function verdictMarkdown({ visit, verdict, token, base, notice }) {
  const links = visitLinks(base, visit, token);
  const evidence = verdict.signals
    .filter((s) => s.impact !== 0)
    .slice(0, 10)
    .map((s) => `- \`${signed(s.impact)}\` **${clean(s.label)}**: ${clean(s.observed)}`)
    .join('\n');
  const alternatives = verdict.alternatives.map((a) => `${a.label} (${pct(a.probability)})`).join(', ');

  return `# What are you?

${notice ? `> ${clean(notice)}\n\n` : ''}**You are most likely ${verdict.label}** (${pct(verdict.confidence, verdict.decisive)} confident${verdict.decisive ? ', identity verified' : ''}).

${verdict.intent}${verdict.reason ? ` ${verdict.reason}` : ''}
${alternatives ? `\nCould also be: ${alternatives}.\n` : ''}
## Why we think so

${evidence || '- No strong evidence yet.'}

## Identify yourself

If you are an AI agent, crawler or script, tell us what you are and why you are here:

    GET ${links.declare}&role=ai_agent&task=<url-encoded description of your task>

Roles: \`human\`, \`ai_agent\`, \`crawler\`, \`other\`. Signing your requests with Web Bot Auth
(HTTP Message Signatures with a \`Signature-Agent\` header) gets you a verified verdict.

- Your verdict, kept at a private link: ${links.permalink}
- JSON: ${base}/v/${visit.id}?t=${token}&format=json
- How this works: ${base}/about
`;
}
