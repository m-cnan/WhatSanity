import express from 'express';
import basicAuth from 'express-basic-auth';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { connState } from '../baileys/connection.js';
import {
  getGroups,
  setGroupEnabled,
  getKeywords,
  addKeyword,
  removeKeyword,
  getSetting,
  setSetting,
} from '../db/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard() {
  const app = express();
  app.use(express.json());

  app.use(
    basicAuth({
      users: { [config.dashboardUser]: config.dashboardPass },
      challenge: true,
    })
  );

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => {
    res.json({
      status: connState.status,
      connectedAs: connState.connectedAs,
    });
  });

  app.get('/api/qr', async (req, res) => {
    if (!connState.qr) return res.json({ qr: null });
    const dataUrl = await QRCode.toDataURL(connState.qr);
    res.json({ qr: dataUrl });
  });

  app.get('/api/groups', (req, res) => {
    res.json(getGroups());
  });

  app.post('/api/groups/:jid/toggle', (req, res) => {
    setGroupEnabled(req.params.jid, !!req.body.enabled);
    res.json({ ok: true });
  });

  app.get('/api/keywords', (req, res) => {
    res.json(getKeywords());
  });

  app.post('/api/keywords', (req, res) => {
    const { pattern } = req.body;
    if (!pattern || !pattern.trim()) return res.status(400).json({ error: 'pattern required' });
    addKeyword(pattern);
    res.json({ ok: true });
  });

  app.delete('/api/keywords/:id', (req, res) => {
    removeKeyword(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/settings', (req, res) => {
    res.json({
      minTextLength: getSetting('minTextLength', String(config.minTextLength)),
      maxMediaMb: getSetting('maxMediaMb', String(config.maxMediaMb)),
    });
  });

  app.post('/api/settings', (req, res) => {
    const { minTextLength, maxMediaMb } = req.body;
    if (minTextLength !== undefined) setSetting('minTextLength', minTextLength);
    if (maxMediaMb !== undefined) setSetting('maxMediaMb', maxMediaMb);
    res.json({ ok: true });
  });

  app.listen(config.dashboardPort, () => {
    console.log(`[dashboard] listening on port ${config.dashboardPort}`);
  });
}
