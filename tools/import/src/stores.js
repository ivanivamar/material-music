import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function withRetry(fn, label, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = err?.code ?? err?.response?.status;
      const retryable = !code || code === 429 || code >= 500 || code === 403;
      if (!retryable || i >= tries) throw err;
      const wait = 1000 * 2 ** (i - 1) + Math.random() * 500;
      console.warn(`  ↻ ${label} failed (${code ?? err.message}), retry ${i}/${tries - 1} in ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Google Drive backend. Paths are arrays of folder names under the Pelagic root. */
export class DriveStore {
  constructor(auth, rootName) {
    this.drive = google.drive({ version: 'v3', auth });
    this.rootName = rootName;
    this.folders = new Map(); // "a/b/c" -> folderId (promise)
  }

  async init() {
    this.rootId = await this.#findOrCreateFolder(this.rootName, 'root');
    this.folders.set('', Promise.resolve(this.rootId));
    return this;
  }

  describe() {
    return `Google Drive → /${this.rootName}`;
  }

  async #findChild(name, parentId, folder) {
    const mime = folder ? `mimeType = '${FOLDER_MIME}'` : `mimeType != '${FOLDER_MIME}'`;
    const res = await withRetry(
      () =>
        this.drive.files.list({
          q: `name = '${q(name)}' and '${parentId}' in parents and ${mime} and trashed = false`,
          fields: 'files(id, size)',
          spaces: 'drive',
          pageSize: 1,
        }),
      `find ${name}`,
    );
    return res.data.files?.[0] ?? null;
  }

  async #findOrCreateFolder(name, parentId) {
    const found = await this.#findChild(name, parentId, true);
    if (found) return found.id;
    const res = await withRetry(
      () =>
        this.drive.files.create({
          requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
          fields: 'id',
        }),
      `mkdir ${name}`,
    );
    return res.data.id;
  }

  /** Resolve (creating as needed) a folder path. Cached + de-duplicated across concurrent callers. */
  folder(parts) {
    const key = parts.join('/');
    if (this.folders.has(key)) return this.folders.get(key);
    const p = (async () => {
      const parent = await this.folder(parts.slice(0, -1));
      return this.#findOrCreateFolder(parts.at(-1), parent);
    })();
    this.folders.set(key, p);
    return p;
  }

  async #put(name, parts, mimeType, makeBody) {
    const parentId = await this.folder(parts);
    const existing = await this.#findChild(name, parentId, false);
    const res = await withRetry(() => {
      const media = { mimeType, body: makeBody() };
      return existing
        ? this.drive.files.update({ fileId: existing.id, media, fields: 'id, size' })
        : this.drive.files.create({ requestBody: { name, parents: [parentId] }, media, fields: 'id, size' });
    }, `upload ${name}`);
    return { id: res.data.id, size: Number(res.data.size ?? 0) };
  }

  uploadFile(localPath, name, parts, mimeType) {
    return this.#put(name, parts, mimeType, () => fs.createReadStream(localPath));
  }

  async readJson(name) {
    const f = await this.#findChild(name, this.rootId, false);
    if (!f) return null;
    const res = await withRetry(
      () => this.drive.files.get({ fileId: f.id, alt: 'media' }, { responseType: 'text' }),
      `read ${name}`,
    );
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }

  writeJson(name, obj) {
    const text = JSON.stringify(obj);
    return this.#put(name, [], 'application/json', () => Readable.from([text]));
  }
}

/** Local-folder backend with the same API — used for testing without touching Drive. */
export class LocalStore {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }
  async init() {
    await fsp.mkdir(this.dir, { recursive: true });
    return this;
  }
  describe() {
    return `local folder → ${this.dir}`;
  }
  async uploadFile(localPath, name, parts, _mime) {
    const dest = path.join(this.dir, ...parts, name);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(localPath, dest);
    const { size } = await fsp.stat(dest);
    return { id: path.relative(this.dir, dest).split(path.sep).join('/'), size };
  }
  async readJson(name) {
    try {
      return JSON.parse(await fsp.readFile(path.join(this.dir, name), 'utf8'));
    } catch {
      return null;
    }
  }
  async writeJson(name, obj) {
    await fsp.writeFile(path.join(this.dir, name), JSON.stringify(obj, null, 2));
    return { id: name };
  }
}
