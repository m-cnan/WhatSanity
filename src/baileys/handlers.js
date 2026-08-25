import { isGroupEnabled, upsertGroup } from '../db/db.js';
import { extractText, isNoise, matchesWatchKeywords, hasMedia } from '../filters/noise.js';
import { isDuplicateText } from '../dedup/dedup.js';
import { handleMedia } from '../media/media.js';
import { appendMessage } from '../writer/markdown.js';

if (!matchesWatchKeywords(text)) continue; // allowlist: must match a watch keyword

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

// Called on every messages.upsert event from Baileys.
export async function onMessages(sock, { messages, type }) {
  if (type !== 'notify') return; // ignore history-sync batches, only live messages

  for (const fullMsg of messages) {
    const jid = fullMsg.key?.remoteJid;
    if (!jid || !jid.endsWith('@g.us')) continue; // groups only
    if (fullMsg.key.fromMe) continue; // skip your own messages
    if (!fullMsg.message) continue;

    if (!isGroupEnabled(jid)) continue; // allowlist check

    const text = extractText(fullMsg.message);

    if (isNoise(fullMsg.message, text)) continue;
    if (isBlockedByKeyword(text)) continue;

    const textIsDup = text ? isDuplicateText(text) : false;
    // If there's no media and the text is a dup, this message adds nothing new — drop it.
    if (textIsDup && !hasMedia(fullMsg.message)) continue;

    let mediaRelPath = null;
    let mediaNote = null;

    if (hasMedia(fullMsg.message)) {
      const result = await handleMedia(sock, fullMsg);
      if (result) {
        if (result.skipped) {
          mediaNote = result.reason;
        } else {
          mediaRelPath = result.relativePath;
        }
      }
    }

    // If text was a dup AND media was also a dup/skip-with-nothing-new, drop entirely.
    if (textIsDup && !mediaRelPath && !mediaNote) continue;

    let groupName = jid;
    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta.subject || jid;
      upsertGroup(jid, groupName);
    } catch {
      // fall back to jid if metadata lookup fails
    }

    const senderName = fullMsg.pushName || fullMsg.key.participant?.split('@')[0] || 'Unknown';

    appendMessage({
      groupName,
      senderName,
      time: formatTime(fullMsg.messageTimestamp),
      text: textIsDup ? null : text, // don't repeat text we've already logged elsewhere
      mediaRelPath,
      mediaNote,
      groupTag: slugify(groupName),
    });
  }
}

// Called on groups.upsert / groups.update — keeps the dashboard's group list current.
export function onGroupsUpdate(groups) {
  for (const g of groups) {
    if (g.id && g.subject) {
      upsertGroup(g.id, g.subject);
    }
  }
}
