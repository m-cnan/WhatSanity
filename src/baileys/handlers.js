import { isGroupEnabled, upsertGroup } from "../db/db.js";
import {
  extractText,
  extractQuotedText,
  isNoise,
  matchesWatchKeywords,
  hasMedia,
} from "../filters/noise.js";
import { isDuplicateText } from "../dedup/dedup.js";
import { handleMedia, downloadMediaBuffer } from "../media/media.js";
import {
  extractPdfText,
  isPdfDocument,
  getDocumentFileName,
} from "../media/pdf.js";
import { appendMessage } from "../writer/markdown.js";
import { config } from "../config.js";
import { getSetting } from "../db/db.js";

// ... slugify + formatTime (keep your IST version) ...

function maxPdfMb() {
  return parseFloat(getSetting("maxPdfMb", String(config.maxPdfMb ?? 5)));
}

export async function onMessages(sock, { messages, type }) {
  if (type !== "notify") return;

  for (const fullMsg of messages) {
    const jid = fullMsg.key?.remoteJid;
    if (!jid || !jid.endsWith("@g.us")) continue;
    if (fullMsg.key.fromMe) continue;
    if (!fullMsg.message) continue;
    if (!isGroupEnabled(jid)) continue;

    const text = extractText(fullMsg.message);
    const quotedText = extractQuotedText(fullMsg.message);
    const fileName = getDocumentFileName(fullMsg.message);

    // 1) caption / body  2) quoted  3) filename
    let hasKeyword =
      matchesWatchKeywords(text) ||
      matchesWatchKeywords(quotedText || "") ||
      matchesWatchKeywords(fileName);

    // 4) PDF body — only if still no match, and under PDF size cap
    let preloadedBuffer = null;
    if (!hasKeyword && isPdfDocument(fullMsg.message)) {
      const node = fullMsg.message.documentMessage;
      const sizeMb = Number(node.fileLength || 0) / (1024 * 1024);
      if (sizeMb > 0 && sizeMb <= maxPdfMb()) {
        try {
          preloadedBuffer = await downloadMediaBuffer(sock, fullMsg);
          const pdfText = await extractPdfText(preloadedBuffer);
          if (matchesWatchKeywords(pdfText)) {
            hasKeyword = true;
          } else {
            preloadedBuffer = null; // not relevant — don't keep buffer
          }
        } catch {
          preloadedBuffer = null;
        }
      }
    }

    if (!hasKeyword) continue;
    if (isNoise(fullMsg.message, text)) continue;

    const textIsDup = text ? isDuplicateText(text) : false;

    let mediaRelPath = null;
    let mediaIsNew = false;

    if (hasMedia(fullMsg.message)) {
      const result = await handleMedia(sock, fullMsg, {
        preloadedBuffer: preloadedBuffer || undefined,
      });
      if (result && !result.skipped && result.relativePath) {
        mediaRelPath = result.relativePath;
        mediaIsNew = !result.reused;
      }
    }

    const hasUsefulText = text && !textIsDup;
    const hasUsefulMedia = !!mediaRelPath;

    if (!hasUsefulText && !hasUsefulMedia) continue;
    if (!hasUsefulText && mediaRelPath && !mediaIsNew) continue;

    let groupName = jid;
    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta.subject || jid;
      upsertGroup(jid, groupName);
    } catch {
      // fallback
    }

    const senderName =
      fullMsg.pushName || fullMsg.key.participant?.split("@")[0] || "Unknown";

    appendMessage({
      groupName,
      senderName,
      time: formatTime(fullMsg.messageTimestamp),
      text: hasUsefulText ? text : null,
      quotedText,
      mediaRelPath,
      groupTag: slugify(groupName),
    });

    try {
      await sock.readMessages([fullMsg.key]);
    } catch (err) {
      console.error("[baileys] readMessages failed", err?.message || err);
    }
  }
}

export function onGroupsUpdate(groups) {
  for (const g of groups) {
    if (g.id && g.subject) {
      upsertGroup(g.id, g.subject);
    }
  }
}
