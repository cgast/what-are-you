// Persistence (SQLite via node:sqlite). Stores visits with facts, not raw IPs.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const MAX_EVENTS = 50;

export function openStore(file = path.join(config.dataDir, 'what-are-you.sqlite')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      request_facts TEXT NOT NULL,
      client_facts TEXT,
      events TEXT NOT NULL DEFAULT '[]',
      declaration TEXT,
      category TEXT NOT NULL,
      confidence REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS visits_created ON visits (created_at);
  `);

  const secret = config.appSecret || getOrCreateSecret(db);
  const stmt = {
    insert: db.prepare(`INSERT INTO visits (id, created_at, updated_at, ip_hash, request_facts, events, category, confidence)
                        VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`),
    get: db.prepare('SELECT * FROM visits WHERE id = ?'),
    update: db.prepare(`UPDATE visits SET updated_at = ?, client_facts = ?, events = ?, declaration = ?, category = ?, confidence = ?
                        WHERE id = ?`),
    stats: db.prepare('SELECT category, COUNT(*) AS n FROM visits WHERE created_at >= ? GROUP BY category ORDER BY n DESC'),
    declared: db.prepare(`SELECT json_extract(declaration, '$.role') AS role, COUNT(*) AS n FROM visits
                          WHERE created_at >= ? AND declaration IS NOT NULL GROUP BY role ORDER BY n DESC`),
    purge: db.prepare('DELETE FROM visits WHERE created_at < ?'),
  };

  const hmac = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

  function rowToVisit(row) {
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ipHash: row.ip_hash,
      requestFacts: JSON.parse(row.request_facts),
      clientFacts: row.client_facts ? JSON.parse(row.client_facts) : null,
      events: JSON.parse(row.events),
      declaration: row.declaration ? JSON.parse(row.declaration) : null,
      category: row.category,
      confidence: row.confidence,
    };
  }

  return {
    /** Per-visit capability token: only whoever received the page can add evidence to the visit. */
    tokenFor: (id) => hmac(`visit:${id}`).slice(0, 22),
    checkToken(id, token) {
      const expected = Buffer.from(this.tokenFor(id));
      const given = Buffer.from(String(token || ''));
      return expected.length === given.length && crypto.timingSafeEqual(expected, given);
    },
    hashIp: (ip) => hmac(`ip:${ip}`).slice(0, 16),

    createVisit({ ip, requestFacts, verdict }) {
      const id = crypto.randomBytes(12).toString('base64url');
      const now = Date.now();
      stmt.insert.run(id, now, now, this.hashIp(ip), JSON.stringify(requestFacts), verdict.category, verdict.confidence);
      return this.getVisit(id);
    },
    getVisit: (id) => rowToVisit(stmt.get.get(String(id))),
    saveVisit(visit, verdict) {
      stmt.update.run(
        Date.now(),
        visit.clientFacts ? JSON.stringify(visit.clientFacts) : null,
        JSON.stringify(visit.events.slice(-MAX_EVENTS)),
        visit.declaration ? JSON.stringify(visit.declaration) : null,
        verdict.category,
        verdict.confidence,
        visit.id,
      );
    },
    stats(sinceMs) {
      return { categories: stmt.stats.all(sinceMs), declared: stmt.declared.all(sinceMs) };
    },
    purgeOlderThan: (ms) => Number(stmt.purge.run(ms).changes),
    close: () => db.close(),
  };
}

function getOrCreateSecret(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'secret'").get();
  if (row) return row.value;
  const value = crypto.randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO meta (key, value) VALUES ('secret', ?)").run(value);
  return value;
}
