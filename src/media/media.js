import { downloadMediaMessage } from 'baileys';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, mediaDir } from '../config.js';
import { hashBuffer, isDuplicateMedia } from '../dedup/dedup.js';
import { getSetting } from '../db/db.js';

function maxMediaMb() {
  return parseFloat(getSetting('maxMediaMb', String(config.maxMediaMb)));
}

fs.mkdirSync(mediaDir, { recursive: true });

const EXT_BY_TYPE = {
  imageMessage: 'jpg',
  videoMessage: 'mp4',
  documentMessage: null, // keep original filename/extension when present
  audioMessage: 'ogg',
};

function getMediaMeta(message) {
  for (const type of Object.keys(EXT_BY_TYPE)) {
    if (message[type]) {
      return { type, node: message[type] };
    }
  }
  return null;
}

// Returns { skipped: true, reason } OR { skipped: false, relativePath }
export async function handleMedia(sock, fullMsg) {
  const meta = getMediaMeta(fullMsg.message);
  if (!meta) return null;

  const { type, node } = meta;
  const sizeBytes = Number(node.fileLength || 0);
  const sizeMb = sizeBytes / (1024 * 1024);

  const capMb = maxMediaMb();
  if (sizeMb > capMb) {
    return {
      skipped: true,
      reason: `${type.replace('Message', '')} skipped — ${sizeMb.toFixed(1)}MB exceeds ${capMb}MB cap`,
    };
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      fullMsg,
      'buffer',
      {},
      { reuploadRequest: sock.updateMediaMessage }
    );
  } catch (err) {
    return { skipped: true, reason: `media download failed: ${err.message}` };
  }

  if (isDuplicateMedia(buffer)) {
    return { skipped: true, reason: 'duplicate media (already saved earlier)' };
  }

  const ext = EXT_BY_TYPE[type] || (node.fileName ? path.extname(node.fileName).slice(1) : 'bin');
  const shortHash = hashBuffer(buffer).slice(0, 10);
  const filename = `${Date.now()}_${shortHash}.${ext || 'bin'}`;
  const fullPath = path.join(mediaDir, filename);

  fs.writeFileSync(fullPath, buffer);

  return {
    skipped: false,
    relativePath: path.join('media', filename),
    type,
    sizeMb,
  };
}
