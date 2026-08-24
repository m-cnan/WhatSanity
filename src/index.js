import { startBaileys, connState, getSocket } from './baileys/connection.js';
import { onMessages, onGroupsUpdate } from './baileys/handlers.js';
import { startDashboard } from './dashboard/server.js';
import { upsertGroup, pruneDedup } from './db/db.js';
import { config } from './config.js';

async function populateGroupsOnceConnected() {
  // poll until connected, then pull the full group list so they show up
  // in the dashboard even before any new message arrives
  const interval = setInterval(async () => {
    if (connState.status !== 'connected') return;
    clearInterval(interval);
    try {
      const sock = getSocket();
      const groups = await sock.groupFetchAllParticipating();
      for (const jid of Object.keys(groups)) {
        upsertGroup(jid, groups[jid].subject || jid);
      }
      console.log(`[startup] loaded ${Object.keys(groups).length} groups`);
    } catch (err) {
      console.error('[startup] failed to fetch group list', err);
    }
  }, 2000);
}

async function main() {
  startDashboard();
  await startBaileys(onMessages, onGroupsUpdate);
  populateGroupsOnceConnected();

  // keep the dedup tables from growing forever
  setInterval(() => pruneDedup(config.dedupTtlHours), 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
