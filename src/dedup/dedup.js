import crypto from 'node:crypto';
import { seenTextHash, recordTextHash, seenMediaHash, recordMediaHash } from '../db/db.js';

function normalize(text) {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function hashText(text) {
  return crypto.createHash('sha256').update(normalize(text)).digest('hex');
}

export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function isDuplicateText(text) {
  if (!text) return false;
  const hash = hashText(text);
  if (seenTextHash(hash)) return true;
  recordTextHash(hash);
  return false;
}

// Returns { isDuplicate: true, path } or { isDuplicate: false, hash }
export function checkMedia(buffer) {
  const hash = hashBuffer(buffer);
  const existing = seenMediaHash(hash);
  if (existing) {
    return { isDuplicate: true, path: existing.path || null };
  }
  return { isDuplicate: false, hash };
}

export function recordMedia(hash, relativePath) {
  recordMediaHash(hash, relativePath);
}
