import { config } from '../config.js';
import { getKeywords, getSetting } from '../db/db.js';

function minTextLength() {
  return parseInt(getSetting('minTextLength', String(config.minTextLength)), 10);
}

// Pull whatever text exists out of a Baileys message object,
// regardless of which message type it arrived as.
export function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  ).trim();
}

// A handful of very common low-signal messages worth dropping outright.
const NOISE_PATTERNS = [
  /^(ok+|okay|k)\.?$/i,
  /^(lol+|lmao+|haha+)\.?$/i,
  /^(yes|no|yeah|nah)\.?$/i,
  /^(thanks|thank you|ty)\.?$/i,
  /^👍+$|^🙏+$|^❤️+$/,
];

export function isNoise(message, text) {
  if (message.stickerMessage && !text) return true; // bare sticker, no caption
  if (message.reactionMessage) return true;
  if (message.protocolMessage) return true; // deletions, edits metadata
  if (!text && !hasMedia(message)) return true; // nothing to show at all

  if (text && text.length < minTextLength() && !hasMedia(message)) return true;
  if (text && NOISE_PATTERNS.some((re) => re.test(text.trim()))) return true;

  return false;
}

export function hasMedia(message) {
  return !!(
    message.imageMessage ||
    message.videoMessage ||
    message.documentMessage ||
    message.audioMessage
  );
}

export function isBlockedByKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const keywords = getKeywords();
  return keywords.some((k) => lower.includes(k.pattern));
}
