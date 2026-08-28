cat > (src / media / media.js) << "EOF";
import { downloadMediaMessage } from "baileys";
import fs from "node:fs";
import path from "node:path";
import { config, mediaDir } from "../config.js";
import { checkMedia, recordMedia, hashBuffer } from "../dedup/dedup.js";
import { getSetting } from "../db/db.js";

function maxMediaMb() {
  return parseFloat(getSetting("maxMediaMb", String(config.maxMediaMb)));
}

fs.mkdirSync(mediaDir, { recursive: true });

const EXT_BY_TYPE = {
  imageMessage: "jpg",
  videoMessage: "mp4",
  documentMessage: null,
  audioMessage: "ogg",
};

function getMediaMeta(message) {
  for (const type of Object.keys(EXT_BY_TYPE)) {
    if (message[type]) {
      return { type, node: message[type] };
    }
  }
  return null;
}

/** Download only — used by PDF keyword probe so we don't fetch twice. */
export async function downloadMediaBuffer(sock, fullMsg) {
  return downloadMediaMessage(
    fullMsg,
    "buffer",
    {},
    { reuploadRequest: sock.updateMediaMessage },
  );
}

/**
 * @param {object} [opts]
 * @param {Buffer} [opts.preloadedBuffer] - already downloaded bytes (PDF path)
 */
export async function handleMedia(sock, fullMsg, opts = {}) {
  const meta = getMediaMeta(fullMsg.message);
  if (!meta) return null;

  const { type, node } = meta;
  const sizeBytes = Number(node.fileLength || 0);
  const sizeMb = sizeBytes / (1024 * 1024);

  const capMb = maxMediaMb();
  if (sizeMb > capMb) {
    return {
      skipped: true,
      reason: `${type.replace("Message", "")} skipped — ${sizeMb.toFixed(1)}MB exceeds ${capMb}MB cap`,
    };
  }

  let buffer = opts.preloadedBuffer || null;
  if (!buffer) {
    try {
      buffer = await downloadMediaBuffer(sock, fullMsg);
    } catch (err) {
      return { skipped: true, reason: `media download failed: ${err.message}` };
    }
  }

  const check = checkMedia(buffer);

  if (check.isDuplicate) {
    if (check.path) {
      return { skipped: false, relativePath: check.path, reused: true };
    }
    return { skipped: true, reason: null };
  }

  const ext =
    EXT_BY_TYPE[type] ||
    (node.fileName ? path.extname(node.fileName).slice(1) : "bin");
  const shortHash = hashBuffer(buffer).slice(0, 10);
  const filename = `${Date.now()}_${shortHash}.${ext || "bin"}`;
  const fullPath = path.join(mediaDir, filename);
  const relativePath = path.join("media", filename);

  fs.writeFileSync(fullPath, buffer);
  recordMedia(check.hash, relativePath);

  return {
    skipped: false,
    relativePath,
    type,
    sizeMb,
  };
}
EOF;
