/**
 * Bera API helper — wraps https://bera-api-tech.replit.app
 * All functions throw on failure so callers can catch cleanly.
 */
import axios from 'axios';

const BASE = 'https://bera-api-tech.replit.app';

async function get(path, params = {}) {
  const res = await axios.get(BASE + path, {
    params,
    timeout: 30000,
    headers: { 'User-Agent': 'CLOUD-AI-Bot/3.2' },
  });
  if (!res.data?.success) throw new Error(res.data?.message || 'Bera API error');
  return res.data;
}

// ─── Search ─────────────────────────────────────────────────────────────────

/** Wikipedia summary for a query */
export async function wikiSearch(query) {
  const data = await get('/api/search/wiki', { query });
  return data.result; // { title, extract, thumbnail }
}

/** Song lyrics */
export async function lyricsSearch(query) {
  const data = await get('/api/search/lyrics', { query });
  return data.result; // { artist, title, image, link, lyrics }
}

/** YouTube search — returns array of video objects */
export async function ytSearch(query, limit = 5) {
  const data = await get('/api/search/yts', { query, limit });
  const results = data.results || [];
  return results.filter(r => r.videoId).map(r => ({
    title: r.title,
    url: r.url,
    duration: r.timestamp || r.duration || '?:??',
    durationSec: r.seconds || 0,
    uploader: r.author?.name || r.channel || 'Unknown',
    views: r.views || 0,
    thumbnail: r.thumbnail || r.image || `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
    videoId: r.videoId,
  }));
}

// ─── Download ────────────────────────────────────────────────────────────────

/** YouTube MP3 — returns { title, quality, thumbnail, download_url } */
export async function ytmp3(url, quality = '128kbps') {
  const data = await get('/api/download/ytmp3', { url, quality });
  if (!data.result?.download_url) throw new Error('No download URL returned');
  return data.result;
}

/** YouTube MP4 — returns { title, quality, thumbnail, download_url } */
export async function ytmp4(url, quality = '480p') {
  const data = await get('/api/download/ytmp4', { url, quality });
  if (!data.result?.download_url) throw new Error('No download URL returned');
  return data.result;
}

/** TikTok no-watermark download — returns { title, duration, cover, video, music, author } */
export async function tiktokDl(url) {
  const data = await get('/api/download/tiktok', { url });
  const r = data.result;
  // Resolve relative paths to full URLs
  const full = (p) => p ? (p.startsWith('http') ? p : BASE + p) : null;
  return {
    title: r.title || 'TikTok Video',
    duration: r.duration,
    cover: full(r.cover),
    video: full(r.video),
    music: full(r.music),
    author: {
      name: r.author?.name || 'Unknown',
      avatar: full(r.author?.avatar),
    },
  };
}
