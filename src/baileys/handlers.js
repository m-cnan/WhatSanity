import { isGroupEnabled, upsertGroup, getSetting } from "../db/db.js";
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

function slugify(name) {
  return (name || "group")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
}

function formatTime(ts) {
  const d = new Date((ts || Date.now() / 1000) * 1000);
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

    // 1) caption/body  2) quoted  3) filename
    let hasKeyword =
      matchesWatchKeywords(text) ||
      matchesWatchKeywords(quotedText || "") ||
      matchesWatchKeywords(fileName);

    // 4) PDF body — only if still no match, under PDF size cap
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
            preloadedBuffer = null;
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
    let mediaNote = null;

    if (hasMedia(fullMsg.message)) {
      const result = await handleMedia(sock, fullMsg, {
        preloadedBuffer: preloadedBuffer || undefined,
      });
      if (result) {
        if (result.skipped) {
          mediaNote = result.reason || null;
        } else if (result.relativePath) {
          mediaRelPath = result.relativePath;
          mediaIsNew = !result.reused;
        }
      }
    }

    const hasUsefulText = text && !textIsDup;
    const hasUsefulMedia = !!mediaRelPath;

    if (!hasUsefulText && !hasUsefulMedia && !mediaNote) continue;
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
      mediaNote,
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
