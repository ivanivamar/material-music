import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (D:\pelagic) */
export const ROOT = path.resolve(here, '../../..');
export const SECRETS_DIR = path.join(ROOT, 'secrets');
export const CLIENT_FILE = path.join(SECRETS_DIR, 'client_desktop.json');
export const TOKEN_FILE = path.join(SECRETS_DIR, 'token.json');
export const TMP_DIR = path.join(ROOT, '.pelagic-tmp');

export const DEFAULTS = {
  musicDir: 'C:\\Users\\ivani\\Music',
  driveRoot: 'Pelagic',
  opusBitrate: '160k',
  coverSize: 600,
  concurrency: 2,
};

export const SCOPES = ['https://www.googleapis.com/auth/drive'];
export const CATALOGUE_NAME = 'library.json';
export const CATALOGUE_VERSION = 1;
