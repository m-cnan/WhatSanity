import { isGroupEnabled, upsertGroup } from '../db/db.js';
import { extractText, extractQuotedText, isNoise, matchesWatchKeywords, hasMedia } from '../filters/noise.js';
import { isDuplicateText } from '../dedup/dedup.js';
import { handleMedia } from '../media/media.js';
import { appendMessage } from '../writer/markdown.js';

function slugify(name) {
  return (name || 'group')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
}

function formatTime(ts) {
  const d = new Date((ts || Date.now() / 1000) * 1000);
  return d.toTimeString().slice(0, 5);
}

export async function onMessages(sock, { messages, type }) {
  if (type !== 'notify') return;

  for (const fullMsg of messages) {
    const jid = fullMsg.key?.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) continue;
    if (fullMsg.key.fromMe) continue;
    if (!fullMsg.message) continue;
    if (!isGroupEnabled(jid)) continue;

    const text = extractText(fullMsg.message);
    const quotedText = extractQuotedText(fullMsg.message);

    // Keyword check on the actual message text (and quoted text as fallback)
    const hasKeyword = matchesWatchKeywords(text) || matchesWatchKeywords(quotedText || '');
    if (!hasKeyword) continue;

    if (isNoise(fullMsg.message, text)) continue;

    const textIsDup = text ? isDuplicateText(text) : false;

    let mediaRelPath = null;
    let mediaIsNew = false;

    if (hasMedia(fullMsg.message)) {
      const result = await handleMedia(sock, fullMsg);
      if (result && !result.skipped && result.relativePath) {
        mediaRelPath = result.relativePath;
        mediaIsNew = !result.reused;
      }
    }

    // === Final drop decision (exactly what you asked for) ===
    // Drop if: nothing new at all
    // - same text (or no text) AND same media (or no media)
    const hasUsefulText = text && !textIsDup;
    const hasUsefulMedia = !!mediaRelPath; // either new or reused

    if (!hasUsefulText && !hasUsefulMedia) continue;

    // Extra rule: if media is only a reuse AND text is missing/duplicate → drop
    // (this catches "same media, no text" and "exact same forward")
    if (!hasUsefulText && mediaRelPath && !mediaIsNew) continue;

    let groupName = jid;
    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta.subject || jid;
      upsertGroup(jid, groupName);
    } catch {
      // fallback
    }

    const senderName = fullMsg.pushName || fullMsg.key.participant?.split('@')[0] || 'Unknown';

    appendMessage({
      groupName,
      senderName,
      time: formatTime(fullMsg.messageTimestamp),
      text: hasUsefulText ? text : null,
      quotedText,
      mediaRelPath,
      groupTag: slugify(groupName),
    });
  }
}

export function onGroupsUpdate(groups) {
  for (const g of groups) {
    if (g.id && g.subject) {
      upsertGroup(g.id, g.subject);
    }
  }
}
