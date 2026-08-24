import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'node:fs';
import { authDir } from '../config.js';

const logger = pino({ level: 'warn' });

fs.mkdirSync(authDir, { recursive: true });

// state shared with the dashboard so it can show connection status / QR
export const connState = {
  status: 'starting', // starting | qr | connected | disconnected
  qr: null,
  connectedAs: null,
};

let sockRef = null;

export function getSocket() {
  return sockRef;
}

export async function startBaileys(onMessages, onGroupsUpdate) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sockRef = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connState.status = 'qr';
      connState.qr = qr;
    }

    if (connection === 'open') {
      connState.status = 'connected';
      connState.qr = null;
      connState.connectedAs = sock.user?.id || null;
      console.log('[baileys] connected as', connState.connectedAs);
    }

    if (connection === 'close') {
      connState.status = 'disconnected';
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('[baileys] connection closed, loggedOut =', loggedOut, statusCode);

      if (!loggedOut) {
        // reconnect automatically on anything except an explicit logout
        setTimeout(() => startBaileys(onMessages, onGroupsUpdate), 3000);
      } else {
        console.log('[baileys] logged out — delete auth folder and restart to re-pair');
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      await onMessages(sock, m);
    } catch (err) {
      console.error('[baileys] error handling messages.upsert', err);
    }
  });

  sock.ev.on('groups.upsert', (groups) => onGroupsUpdate(groups));
  sock.ev.on('groups.update', (groups) => onGroupsUpdate(groups));

  return sock;
}
