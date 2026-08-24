import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { dbPath } from '../config.js';

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  jid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dedup_text (
  hash TEXT PRIMARY KEY,
  seen_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dedup_media (
  hash TEXT PRIMARY KEY,
  seen_at TEXT DEFAULT (datetime('now'))
);
`);

// --- groups ---
export function upsertGroup(jid, name) {
  db.prepare(
    `INSERT INTO groups (jid, name) VALUES (?, ?)
     ON CONFLICT(jid) DO UPDATE SET name = excluded.name`
  ).run(jid, name);
}
export function setGroupEnabled(jid, enabled) {
  db.prepare(`UPDATE groups SET enabled = ?, updated_at = datetime('now') WHERE jid = ?`)
    .run(enabled ? 1 : 0, jid);
}
export function getGroups() {
  return db.prepare(`SELECT * FROM groups ORDER BY name COLLATE NOCASE`).all();
}
export function isGroupEnabled(jid) {
  const row = db.prepare(`SELECT enabled FROM groups WHERE jid = ?`).get(jid);
  return !!row && row.enabled === 1;
}

// --- keywords (blocklist, case-insensitive substring match) ---
export function addKeyword(pattern) {
  db.prepare(`INSERT OR IGNORE INTO keywords (pattern) VALUES (?)`).run(pattern.toLowerCase().trim());
}
export function removeKeyword(id) {
  db.prepare(`DELETE FROM keywords WHERE id = ?`).run(id);
}
export function getKeywords() {
  return db.prepare(`SELECT * FROM keywords ORDER BY pattern`).all();
}

// --- settings ---
export function getSetting(key, fallback) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

// --- dedup ---
export function seenTextHash(hash) {
  return !!db.prepare(`SELECT 1 FROM dedup_text WHERE hash = ?`).get(hash);
}
export function recordTextHash(hash) {
  db.prepare(`INSERT OR IGNORE INTO dedup_text (hash) VALUES (?)`).run(hash);
}
export function seenMediaHash(hash) {
  return !!db.prepare(`SELECT 1 FROM dedup_media WHERE hash = ?`).get(hash);
}
export function recordMediaHash(hash) {
  db.prepare(`INSERT OR IGNORE INTO dedup_media (hash) VALUES (?)`).run(hash);
}
export function pruneDedup(ttlHours) {
  db.prepare(`DELETE FROM dedup_text WHERE seen_at < datetime('now', ?)`).run(`-${ttlHours} hours`);
  db.prepare(`DELETE FROM dedup_media WHERE seen_at < datetime('now', ?)`).run(`-${ttlHours} hours`);
}
