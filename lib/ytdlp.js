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
import { fileURLToPath } from 'url';
import axios from 'axios';

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
 * Download a file from URL to dest path using axios (handles redirects automatically).
 */
async function downloadFile(url, dest) {
  const res = await axios.get(url, {
    responseType: 'stream',
    maxRedirects: 10,
    timeout: 120000,
    headers: { 'User-Agent': 'cloud-ai-bot/1.0' },
  });
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.data.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
    res.data.on('error', reject);
  });
}

/**
 * Ensure yt-dlp binary exists and is executable.
 * Called once on bot startup — downloads if missing.
 */
export async function ensureYtDlp() {
  // 1. Check existing candidates (skip zero-byte placeholder files)
  for (const p of CANDIDATE_PATHS) {
    try {
      const stat = fs.statSync(p);
      if (stat.size === 0) continue; // empty placeholder — skip
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

  // yt-dlp_linux = standalone x86_64 binary (no Python required)
  const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
  console.log(`[yt-dlp] Binary not found — downloading from GitHub...`);

  try {
    await downloadFile(YTDLP_URL, dest);
    fs.chmodSync(dest, 0o755);
    // Verify file is a real binary with decent size (> 1MB)
    const stat = fs.statSync(dest);
    if (stat.size < 1024 * 1024) throw new Error(`Downloaded file too small (${stat.size} bytes) — wrong URL?`);
    _ytdlpPath = dest;
    console.log(`[yt-dlp] ✅ Downloaded and ready at ${dest} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
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
      throw new Error('yt-dlp is not available.');
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
      '--extractor-args', 'youtube:player_client=android,web',
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
 * Download audio as M4A (no ffmpeg re-encoding = much faster).
 * Pass pre-fetched `meta` to skip the redundant getInfo() call.
 */
export async function downloadAudio(url, options = {}) {
  const bin = _ytdlpPath;
  if (!bin) throw new Error('yt-dlp not initialized. Call ensureYtDlp() first.');

  // Use pre-fetched meta if provided, otherwise fetch it once
  const meta = options.meta || await getInfo(url);
  const id  = tmpId();
  const out = path.join(TMP, `${id}.%(ext)s`);

  // Download best m4a/aac directly — NO ffmpeg conversion needed, WhatsApp plays m4a fine
  // Falls back to any audio format if m4a unavailable
  // Android client bypasses YouTube's bot/sign-in check
  const args = [
    url,
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=aac]/bestaudio',
    '-o', out,
    '--no-warnings',
    '--no-progress',
    '--concurrent-fragments', '4',
    '--extractor-args', 'youtube:player_client=android,web',
  ];

  if (options.maxSize) args.push('--max-filesize', options.maxSize);

  try {
    await execFileAsync(bin, args, { timeout: 120000 });
    // Find whichever audio file was saved
    const files = fs.readdirSync(TMP).filter(f => f.startsWith(id));
    if (!files.length) throw new Error('Audio file not found after download');
    const file = path.join(TMP, files[0]);
    const ext  = path.extname(files[0]).slice(1) || 'm4a';
    return { file, ext, ...meta };
  } catch (err) {
    cleanup(TMP, id);
    const msg = (err.stderr || '').split('\n').find(l => l.includes('ERROR')) || err.message;
    throw new Error(msg.replace('ERROR: ', '').trim() || 'Audio download failed');
  }
}

/**
 * Download video as MP4.
 * Pass pre-fetched `meta` to skip the redundant getInfo() call.
 */
export async function downloadVideo(url, options = {}) {
  const bin = _ytdlpPath;
  if (!bin) throw new Error('yt-dlp not initialized. Call ensureYtDlp() first.');

  const meta = options.meta || await getInfo(url);
  const id  = tmpId();
  const out = path.join(TMP, `${id}.%(ext)s`);
  const quality = options.quality || '480';   // 480p default — faster than 720p, still good on mobile
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
    '--concurrent-fragments', '4',
    '--extractor-args', 'youtube:player_client=android,web',
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
