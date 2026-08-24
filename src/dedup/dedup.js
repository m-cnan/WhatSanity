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

// Returns true if this text was already seen (and records it if not).
export function isDuplicateText(text) {
  if (!text) return false;
  const hash = hashText(text);
  if (seenTextHash(hash)) return true;
  recordTextHash(hash);
  return false;
}

// Same idea for raw media bytes — catches the exact same image/video/doc
// being forwarded into multiple groups.
export function isDuplicateMedia(buffer) {
  const hash = hashBuffer(buffer);
  if (seenMediaHash(hash)) return true;
  recordMediaHash(hash);
  return false;
}
