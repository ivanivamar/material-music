import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
  });
}

/** FLAC -> Opus (Ogg), keeping tags (incl. lyrics), dropping embedded art. */
export async function toOpus(input, output, bitrate) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run(['-i', input, '-map', '0:a:0', '-map_metadata', '0', '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on', output]);
}

/**
 * Extract cover art to a square-bounded JPEG.
 * Tries the embedded picture first, then cover/folder/front images next to the file.
 * Returns true if a cover was written.
 */
export async function extractCover(flacPath, output, size) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const scale = `scale=${size}:${size}:force_original_aspect_ratio=decrease`;
  try {
    await run(['-i', flacPath, '-an', '-map', '0:v:0', '-frames:v', '1', '-vf', scale, '-q:v', '3', output]);
    return true;
  } catch {
    /* no embedded art */
  }
  const dir = path.dirname(flacPath);
  const files = await fs.readdir(dir).catch(() => []);
  const img = files.find((f) => /^(cover|folder|front|album)\.(jpe?g|png|webp)$/i.test(f));
  if (!img) return false;
  await run(['-i', path.join(dir, img), '-frames:v', '1', '-vf', scale, '-q:v', '3', output]);
  return true;
}
