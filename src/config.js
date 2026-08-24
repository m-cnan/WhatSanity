import 'dotenv/config';
import path from 'node:path';

export const config = {
  vaultPath: process.env.VAULT_PATH || './data/vault',
  statePath: process.env.STATE_PATH || './data/state',
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || '8080', 10),
  dashboardUser: process.env.DASHBOARD_USER || 'admin',
  dashboardPass: process.env.DASHBOARD_PASS || 'change-me-please',
  minTextLength: parseInt(process.env.MIN_TEXT_LENGTH || '3', 10),
  maxMediaMb: parseInt(process.env.MAX_MEDIA_MB || '15', 10),
  dedupTtlHours: parseInt(process.env.DEDUP_TTL_HOURS || '72', 10),
};

export const authDir = path.join(config.statePath, 'auth');
export const dbPath = path.join(config.statePath, 'app.db');
export const mediaDir = path.join(config.vaultPath, 'media');
