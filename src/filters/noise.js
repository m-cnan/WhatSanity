import { config } from "../config.js";
import { getKeywords, getSetting } from "../db/db.js";

function minTextLength() {
  return parseInt(getSetting("minTextLength", String(config.minTextLength)), 10);
}

export function extractText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  ).trim();
}

// Get the text of the message being replied to (if any)
export function extractQuotedText(message) {
  if (!message) return null;
  const ctx =
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    null;

  if (!ctx?.quotedMessage) return null;
  return extractText(ctx.quotedMessage) || null;
}

const NOISE_PATTERNS = [
  /^(ok+|okay|k)\.?$/i,
  /^(lol+|lmao+|haha+)\.?$/i,
  /^(yes|no|yeah|nah)\.?$/i,
  /^(thanks|thank you|ty)\.?$/i,
  /^👍+$|^🙏+$|^❤️+$/,
];

export function isNoise(message, text) {
  if (message.stickerMessage && !text) return true;
  if (message.reactionMessage) return true;
  if (message.protocolMessage) return true;
  if (!text && !hasMedia(message)) return true;

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

export function matchesWatchKeywords(text) {
  const keywords = getKeywords();
  if (keywords.length === 0) return false;
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.pattern));
}
