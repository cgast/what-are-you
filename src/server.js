import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { startIpListRefresh } from './detect/network.js';
import { openStore } from './store/db.js';

const store = openStore();
const app = createApp(store);

// IP lists load in the background; until then, claims are reported as "not verifiable".
startIpListRefresh().catch((err) => console.warn('[ip-lists]', err.message));

const purge = () => {
  const removed = store.purgeOlderThan(Date.now() - config.retentionDays * 86_400_000);
  if (removed) console.log(`[retention] removed ${removed} visits`);
};
purge();
setInterval(purge, 60 * 60 * 1000).unref();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`what-are-you listening on http://${info.address}:${info.port} (trusted proxy hops: ${config.trustProxyHops})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
