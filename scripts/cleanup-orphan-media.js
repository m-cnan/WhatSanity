#!/usr/bin/env node
/**
 * Deletes media files under data/vault/media that are no longer
 * referenced by any Markdown file under data/vault/WhatsApp.
 */
import fs from 'node:fs';
import path from 'node:path';

const VAULT = process.env.VAULT_PATH || './data/vault';
const WA_DIR = path.join(VAULT, 'WhatsApp');
const MEDIA_DIR = path.join(VAULT, 'media');

function collectMarkdownFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdownFiles(full, list);
    else if (entry.name.endsWith('.md')) list.push(full);
  }
  return list;
}

function extractMediaRefs(content) {
  const refs = new Set();
  // Matches ![[media/filename.ext]] or [[media/filename.ext]]
  const re = /!?\[\[(media\/[^\]|#]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    refs.add(m[1].replace(/\\/g, '/'));
  }
  return refs;
}

function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('[cleanup] no media folder, nothing to do');
    return;
  }

  const mdFiles = collectMarkdownFiles(WA_DIR);
  const referenced = new Set();

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const ref of extractMediaRefs(content)) {
      referenced.add(ref);
    }
  }

  const mediaFiles = fs.readdirSync(MEDIA_DIR);
  let deleted = 0;
  let kept = 0;

  for (const name of mediaFiles) {
    const rel = path.join('media', name).replace(/\\/g, '/');
    const full = path.join(MEDIA_DIR, name);

    if (!fs.statSync(full).isFile()) continue;

    if (referenced.has(rel)) {
      kept++;
    } else {
      fs.unlinkSync(full);
      deleted++;
      console.log(`[cleanup] deleted orphan: ${rel}`);
    }
  }

  console.log(`[cleanup] done — kept ${kept}, deleted ${deleted}`);
}

main();
