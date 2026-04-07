/**
 * yt-dlp wrapper — downloads audio/video for any supported platform.
 * Auto-downloads the yt-dlp binary on first run (works on Replit, BeraHost, VPS, etc.)
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

// Resolve bot root directory (lib/ → ../)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.resolve(__dirname, '..');

// yt-dlp binary — checked in order, first found wins
const CANDIDATE_PATHS = [
  process.env.YTDLP_PATH,                        // custom env override
  path.join(BOT_ROOT, 'bin', 'yt-dlp'),           // local bot bin/ (portable, works everywhere)
  '/home/runner/bin/yt-dlp',                      // Replit
  '/usr/local/bin/yt-dlp',                        // system install
  '/usr/bin/yt-dlp',                              // system install
].filter(Boolean);

// Mutable resolved path (updated by ensureYtDlp)
let _ytdlpPath = null;

export function getYtDlpPath() {
  return _ytdlpPath;
}

// Temp directory for downloads
const TMP = path.join(os.tmpdir(), 'cloud-ai-dl');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

/**
 * Download a file from URL to dest path, following redirects.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (reqUrl) => {
      https.get(reqUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          file.close();
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode} downloading yt-dlp`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', reject);
    };
    request(url);
  });
}

/**
 * Ensure yt-dlp binary exists and is executable.
 * Called once on bot startup — downloads if missing.
 */
export async function ensureYtDlp() {
  // 1. Check existing candidates
  for (const p of CANDIDATE_PATHS) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      _ytdlpPath = p;
      console.log(`[yt-dlp] Found at ${p}`);
      return p;
    } catch {}
  }

  // 2. Not found — download to bot's local bin/
  const binDir = path.join(BOT_ROOT, 'bin');
  const dest = path.join(binDir, 'yt-dlp');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  console.log(`[yt-dlp] Binary not found — downloading from GitHub...`);

  try {
    await downloadFile(YTDLP_URL, dest);
    fs.chmodSync(dest, 0o755);
    // Quick sanity check
    await execFileAsync(dest, ['--version'], { timeout: 10000 });
    _ytdlpPath = dest;
    console.log(`[yt-dlp] ✅ Downloaded and ready at ${dest}`);
    return dest;
  } catch (err) {
    console.error(`[yt-dlp] ❌ Download failed: ${err.message}`);
    // Last resort: try system yt-dlp via PATH
    try {
      await execFileAsync('yt-dlp', ['--version'], { timeout: 5000 });
      _ytdlpPath = 'yt-dlp';
      console.log(`[yt-dlp] Using system yt-dlp from PATH`);
      return 'yt-dlp';
    } catch {
      throw new Error('yt-dlp is not available. Please install it manually.');
    }
  }
}

function tmpId() {
  return crypto.randomBytes(6).toString('hex');
}

function cleanup(dir, id) {
  try {
    fs.readdirSync(dir)
      .filter(f => f.startsWith(id))
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
  } catch {}
}

/**
 * Get video/audio metadata (no download).
 */
export async function getInfo(url) {
  const bin = _ytdlpPath;
  if (!bin) throw new Error('yt-dlp not initialized. Call ensureYtDlp() first.');
  try {
    const { stdout } = await execFileAsync(bin, [
      url,
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--skip-download',
      '--print', '%(title)s',
      '--print', '%(duration_string)s',
      '--print', '%(duration)s',
      '--print', '%(uploader)s',
      '--print', '%(view_count)s',
      '--print', '%(thumbnail)s',
      '--print', '%(webpage_url)s',
      '--print', '%(ext)s',
    ], { timeout: 30000 });

    const [title, duration, durationSec, uploader, views, thumbnail, webpage_url, ext] =
      stdout.trim().split('\n');
    return {
      title: title || 'Unknown',
      duration: duration || '?:??',
      durationSec: parseInt(durationSec) || 0,
      uploader: uploader || 'Unknown',
      views: parseInt(views) || 0,
      thumbnail: thumbnail || null,
      url: webpage_url || url,
      ext: ext || 'mp4',
    };
  } catch {
    return { title: url, duration: '?:??', durationSec: 0, uploader: 'Unknown', views: 0, thumbnail: null, url };
  }
}

/**
 * Download audio as MP3.
 */
export async function downloadAudio(url, options = {}) {
  const bin = _ytdlpPath;
  if (!bin) throw new Error('yt-dlp not initialized. Call ensureYtDlp() first.');

  const meta = await getInfo(url);
  const id  = tmpId();
  const out = path.join(TMP, `${id}.%(ext)s`);
  const mp3 = path.join(TMP, `${id}.mp3`);

  const args = [
    url,
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', options.quality || '5',
    '-o', out,
    '--no-warnings',
    '--no-progress',
  ];

  if (options.maxSize) args.push('--max-filesize', options.maxSize);

  try {
    await execFileAsync(bin, args, { timeout: 120000 });
    if (!fs.existsSync(mp3)) throw new Error('MP3 not found after conversion');
    return { file: mp3, ...meta };
  } catch (err) {
    cleanup(TMP, id);
    const msg = (err.stderr || '').split('\n').find(l => l.includes('ERROR')) || err.message;
    throw new Error(msg.replace('ERROR: ', '').trim() || 'Audio download failed');
  }
}

/**
 * Download video as MP4.
 */
export async function downloadVideo(url, options = {}) {
  const bin = _ytdlpPath;
  if (!bin) throw new Error('yt-dlp not initialized. Call ensureYtDlp() first.');

  const meta = await getInfo(url);
  const id  = tmpId();
  const out = path.join(TMP, `${id}.%(ext)s`);
  const quality = options.quality || '720';
  const fmt = quality === 'best'
    ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    : `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;

  const args = [
    url,
    '--no-playlist',
    '-f', fmt,
    '--merge-output-format', 'mp4',
    '-o', out,
    '--no-warnings',
    '--no-progress',
  ];

  if (options.maxSize) args.push('--max-filesize', options.maxSize);

  try {
    await execFileAsync(bin, args, { timeout: 180000 });
    const mp4 = path.join(TMP, `${id}.mp4`);
    if (fs.existsSync(mp4)) return { file: mp4, ...meta };
    const files = fs.readdirSync(TMP).filter(f => f.startsWith(id));
    if (!files.length) throw new Error('Video file not found after download');
    return { file: path.join(TMP, files[0]), ...meta };
  } catch (err) {
    cleanup(TMP, id);
    const msg = (err.stderr || '').split('\n').find(l => l.includes('ERROR')) || err.message;
    throw new Error(msg.replace('ERROR: ', '').trim() || 'Video download failed');
  }
}

/**
 * Search YouTube and return top N results.
 */
export async function ytSearch(query, limit = 5) {
  const { default: yts } = await import('yt-search');
  const res = await yts(query);
  return (res.videos || []).slice(0, limit).map(v => ({
    title: v.title,
    url: v.url,
    duration: v.timestamp,
    durationSec: v.seconds,
    uploader: v.author?.name || 'Unknown',
    views: v.views,
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    videoId: v.videoId,
  }));
}

/**
 * Cleanup old temp files (> 30 min old).
 */
export function cleanTmp() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(TMP)) {
      const fp = path.join(TMP, f);
      if (now - fs.statSync(fp).mtimeMs > 30 * 60 * 1000) {
        try { fs.unlinkSync(fp); } catch {}
      }
    }
  } catch {}
}

// Auto-cleanup every 30 minutes
setInterval(cleanTmp, 30 * 60 * 1000);
