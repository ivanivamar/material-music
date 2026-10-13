import fs from 'node:fs/promises';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { CLIENT_FILE, TOKEN_FILE, SCOPES } from './config.js';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

/**
 * Returns an authorised OAuth2 client.
 * First run opens the browser for Google sign-in; the refresh token is cached in secrets/token.json.
 */
export async function getAuth() {
  let keys;
  try {
    keys = await readJson(CLIENT_FILE);
  } catch {
    throw new Error(
      `Missing ${CLIENT_FILE}\nDownload the "Pelagic Import" Desktop client JSON from Google Cloud and save it there.`,
    );
  }
  const k = keys.installed || keys.web;

  // Try cached token first
  try {
    const saved = await readJson(TOKEN_FILE);
    const client = new google.auth.OAuth2(k.client_id, k.client_secret);
    client.setCredentials(saved);
    await client.getAccessToken(); // throws if the refresh token was revoked/expired
    persistRefreshes(client, saved);
    return client;
  } catch {
    /* fall through to interactive sign-in */
  }

  console.log('Opening browser for Google sign-in…');
  const client = await authenticate({ keyfilePath: CLIENT_FILE, scopes: SCOPES });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(client.credentials, null, 2));
  persistRefreshes(client, client.credentials);
  return client;
}

function persistRefreshes(client, base) {
  client.on('tokens', async (tokens) => {
    const merged = { ...base, ...tokens };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(merged, null, 2)).catch(() => {});
  });
}
