import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const waDir = path.join(config.vaultPath, 'WhatsApp');
fs.mkdirSync(waDir, { recursive: true });

function todayFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}.md`;
}

function ensureNoteExists(filePath, date) {
  if (fs.existsSync(filePath)) return;
  const dateStr = todayFilename(date).replace('.md', '');
  const header = `---\ndate: ${dateStr}\ntags: [whatsapp-digest]\n---\n\n# WhatsApp — ${dateStr}\n\n`;
  fs.writeFileSync(filePath, header);
}

function escapeForCallout(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/g, '')
    .replace(/\n/g, '\n> ');
}

export function appendMessage({ groupName, senderName, time, text, quotedText, mediaRelPath, groupTag }) {
  const date = new Date();
  const filePath = path.join(waDir, todayFilename(date));
  ensureNoteExists(filePath, date);

  const tag = groupTag ? ` #wa/${groupTag}` : '';
  let block = `> [!note] ${time} · ${groupName} · ${senderName}${tag}\n`;

  if (quotedText) {
    block += `> **Replying to:**\n`;
    block += `> > ${escapeForCallout(quotedText).replace(/\n> /g, '\n> > ')}\n`;
    block += `>\n`;
  }

  if (text) {
    block += `> ${escapeForCallout(text)}\n`;
  }
  if (mediaRelPath) {
    block += `> ![[${mediaRelPath}]]\n`;
  }

  // True blank line between callouts
  block += '\n';

  fs.appendFileSync(filePath, block);
}
