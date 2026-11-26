// End-to-end Web Bot Auth: a local key directory, a signed request, and our verifier.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

process.env.UNSAFE_ALLOW_PRIVATE_FETCH = 'true'; // the test directory lives on 127.0.0.1 over http
const { sign, generateNonce } = await import('web-bot-auth');
const { signerFromJWK } = await import('web-bot-auth/crypto');
const { checkWebBotAuth } = await import('../src/detect/webBotAuth.js');

// RFC 9421 Appendix B.1.4 test key (public test vector, not a secret).
const PRIVATE_JWK = { kty: 'OKP', crv: 'Ed25519', d: 'n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU', x: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs' };
const PUBLIC_JWK = { kty: 'OKP', crv: 'Ed25519', x: PRIVATE_JWK.x };

let server;
let agentOrigin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/.well-known/http-message-signatures-directory') {
      res.setHeader('content-type', 'application/http-message-signatures-directory+json');
      return res.end(JSON.stringify({ keys: [PUBLIC_JWK] }));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  agentOrigin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function signedHeaders(targetUri, signatureAgent) {
  const now = new Date();
  const fields = await sign(new Request(targetUri, { headers: { 'Signature-Agent': signatureAgent } }), {
    signer: await signerFromJWK(PRIVATE_JWK),
    created: now,
    expires: new Date(now.getTime() + 60_000),
    nonce: generateNonce(),
  });
  return new Headers({ 'signature-agent': signatureAgent, signature: fields.signature, 'signature-input': fields.signatureInput });
}

test('valid signature verifies against the fetched directory', async () => {
  const targetUri = 'https://whatareyou.example/';
  const headers = await signedHeaders(targetUri, `sig1="${agentOrigin}"`);
  const facts = await checkWebBotAuth({ method: 'GET', targetUri, headers });
  assert.equal(facts.verified, true, facts.error);
  assert.equal(facts.agentUri, agentOrigin);
});

test('signature for another host is rejected', async () => {
  const headers = await signedHeaders('https://other.example/', `sig1="${agentOrigin}"`);
  const facts = await checkWebBotAuth({ method: 'GET', targetUri: 'https://whatareyou.example/', headers });
  assert.equal(facts.verified, false);
  assert.ok(facts.error);
});

test('replayed nonce is rejected', async () => {
  const targetUri = 'https://whatareyou.example/';
  const headers = await signedHeaders(targetUri, `sig1="${agentOrigin}"`);
  assert.equal((await checkWebBotAuth({ method: 'GET', targetUri, headers })).verified, true);
  assert.equal((await checkWebBotAuth({ method: 'GET', targetUri, headers })).verified, false);
});

test('no signature headers = not present', async () => {
  const facts = await checkWebBotAuth({ method: 'GET', targetUri: 'https://x.example/', headers: new Headers() });
  assert.deepEqual(facts, { present: false });
});
