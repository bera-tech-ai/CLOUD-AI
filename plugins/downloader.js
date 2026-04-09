import config from '../config.cjs';
import {
  tiktokDl,
  ytSearch as beraYtSearch,
  ytmp3 as beraYtmp3,
  ytmp4 as beraYtmp4,
} from '../lib/beraapi.js';

const p = config.PREFIX;

function fmtViews(n) {
  if (!n) return 'N/A';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── Find YouTube URL from search query or bare URL ───────────────────────────
async function resolveYoutubeUrl(q) {
  if (q.includes('youtu')) return { url: q, title: q, duration: '?:??', uploader: 'Unknown', thumbnail: null };
  const results = await beraYtSearch(q, 1);
  if (!results.length) throw new Error('No results found for that query');
  return results[0];
}

// ─── Fetch file size from URL (HEAD request) → "X.XX MB" ─────────────────────
async function getFileSizeMB(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const bytes = parseInt(res.headers.get('content-length') || '0', 10);
    if (bytes > 0) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch {}
  return null;
}

// ─── Send audio from a direct URL (no disk write needed) ─────────────────────
async function sendAudioFromUrl(conn, m, dl, meta) {
  const quoted = { quoted: { key: m.key, message: m.message } };
  const sizeMB = await getFileSizeMB(dl.download_url);
  if (meta.thumbnail) {
    await conn.sendMessage(m.from, {
      image: { url: meta.thumbnail },
      caption: [
        `🎵 *${dl.title || meta.title || 'Unknown'}*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🎤 *Artist:* ${meta.uploader || 'Unknown'}`,
        `⏱️ *Duration:* ${meta.duration || '?:??'}`,
        meta.views ? `👁️ *Views:* ${fmtViews(meta.views)}` : null,
        `🔊 *Quality:* ${dl.quality || '128kbps'}`,
        sizeMB ? `📦 *Size:* ${sizeMB}` : null,
        ``,
        `> ${config.BOT_NAME}`,
      ].filter(l => l !== null).join('\n'),
    }, quoted).catch(() => {});
  }
  await conn.sendMessage(m.from, {
    audio: { url: dl.download_url },
    mimetype: 'audio/mpeg',
    fileName: `${(dl.title || meta.title || 'audio').replace(/[^\w\s-]/g, '').trim()}.mp3`,
    ptt: false,
  }, quoted);
}

// ─── Send video from a direct URL ────────────────────────────────────────────
async function sendVideoFromUrl(conn, m, dl, meta) {
  const quoted = { quoted: { key: m.key, message: m.message } };
  const sizeMB = await getFileSizeMB(dl.download_url);
  const caption = [
    `🎬 *${dl.title || meta.title || 'Unknown'}*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🎤 *Artist:* ${meta.uploader || 'Unknown'}`,
    `⏱️ *Duration:* ${meta.duration || '?:??'}`,
    meta.views ? `👁️ *Views:* ${fmtViews(meta.views)}` : null,
    `🎞️ *Quality:* ${dl.quality || '480p'}`,
    sizeMB ? `📦 *Size:* ${sizeMB}` : null,
    ``,
    `> ${config.BOT_NAME}`,
  ].filter(l => l !== null).join('\n');
  await conn.sendMessage(m.from, {
    video: { url: dl.download_url },
    mimetype: 'video/mp4',
    fileName: `${(dl.title || meta.title || 'video').replace(/[^\w\s-]/g, '').trim()}.mp4`,
    caption,
  }, quoted);
}

const downloader = async (m, conn) => {
  if (!m.body) return;

  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');
  const quoted = { quoted: { key: m.key, message: m.message } };

  // ─── PLAY / YTMP3 — YouTube Audio ─────────────────────────────────────────
  if (['play', 'music', 'song', 'pl', 'ytmp3', 'ytaudio', 'yt2mp3', 'ytmusic',
       'spotify', 'sp'].includes(cmd)) {
    if (!q) return m.reply(
`🎵 *Play Music*
━━━━━━━━━━━━━━━━━━━━━

Usage: ${p}play <song name or YouTube URL>

Examples:
• ${p}play faded alan walker
• ${p}play https://youtu.be/dQw4w9WgXcQ
• ${p}play bad bunny un verano sin ti

💡 For video: ${p}pv <song name>

> ${config.BOT_NAME}`);

    await m.React('🎵');
    const searching = await conn.sendMessage(m.from, { text: `🔍 *Searching...*\n\n_"${q}"_` }, quoted);
    try {
      const meta = await resolveYoutubeUrl(q);
      await conn.sendMessage(m.from, { delete: searching.key }).catch(() => null);

      const status = await conn.sendMessage(m.from, {
        text: `⬇️ *Downloading Audio...*\n\n🎵 *${meta.title}*\n⏱️ ${meta.duration}`,
      }, quoted);

      const dl = await beraYtmp3(meta.url, '128kbps');
      await conn.sendMessage(m.from, { delete: status.key }).catch(() => null);
      await sendAudioFromUrl(conn, m, dl, meta);
      await m.React('✅');
    } catch (err) {
      await conn.sendMessage(m.from, { delete: searching?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *Audio Download Failed*\n\n${err.message}\n\nTry: ${p}play never gonna give you up\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PV / YTMP4 — YouTube Video ───────────────────────────────────────────
  if (['pv', 'playvid', 'musicvideo', 'mv', 'ytmp4', 'ytvideo', 'yt2mp4', 'ytv'].includes(cmd)) {
    if (!q) return m.reply(
`🎬 *Play Video*
━━━━━━━━━━━━━━━━━━━━━

Usage: ${p}pv <song name or YouTube URL>

Examples:
• ${p}pv faded alan walker
• ${p}pv https://youtu.be/dQw4w9WgXcQ

💡 For audio only: ${p}play <song name>

> ${config.BOT_NAME}`);

    await m.React('🎬');
    const searching = await conn.sendMessage(m.from, { text: `🔍 *Searching...*\n\n_"${q}"_` }, quoted);
    try {
      const meta = await resolveYoutubeUrl(q);
      await conn.sendMessage(m.from, { delete: searching.key }).catch(() => null);

      const status = await conn.sendMessage(m.from, {
        text: `⬇️ *Downloading Video...*\n\n🎬 *${meta.title}*\n⏱️ ${meta.duration}`,
      }, quoted);

      const dl = await beraYtmp4(meta.url, '480p');
      await conn.sendMessage(m.from, { delete: status.key }).catch(() => null);
      await sendVideoFromUrl(conn, m, dl, meta);
      await m.React('✅');
    } catch (err) {
      await conn.sendMessage(m.from, { delete: searching?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *Video Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── YOUTUBE SEARCH (Bera API) ────────────────────────────────────────────
  if (['yts', 'ytsearch', 'searchyt', 'ytsong'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}yts <search query>\n\nExample: ${p}yts faded alan walker\n\n> ${config.BOT_NAME}`);
    await m.React('🔍');
    try {
      const results = await beraYtSearch(q, 5);
      if (!results.length) throw new Error('No results found');
      const list = results.map((v, i) =>
        `*${i + 1}.* ${v.title}\n    🎤 ${v.uploader || 'Unknown'} | ⏱️ ${v.duration} | 👁️ ${fmtViews(v.views)}\n    🔗 ${v.url}`
      ).join('\n\n');
      await m.reply(
`🔍 *YouTube Search Results*
━━━━━━━━━━━━━━━━━━━━━

${list}

━━━━━━━━━━━━━━━━━━━━━
💡 To download: ${p}play <song name>

> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Search Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TIKTOK (Bera API — no watermark) ────────────────────────────────────
  if (['tiktok', 'tt', 'ttdl', 'tiktokdl'].includes(cmd)) {
    if (!q || !q.includes('tiktok')) return m.reply(
`❌ *TikTok Downloader*
━━━━━━━━━━━━━━━━━━━━━

Usage: ${p}tiktok <TikTok URL>

Example:
• ${p}tiktok https://vm.tiktok.com/xxxxx

> ${config.BOT_NAME}`);

    await m.React('🎵');
    const status = await conn.sendMessage(m.from, { text: `⬇️ *Downloading TikTok (no watermark)...*` }, quoted);
    try {
      const dl = await tiktokDl(q);
      await conn.sendMessage(m.from, { delete: status.key }).catch(() => null);
      const caption = [
        `🎵 *TikTok Video*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `👤 *@${dl.author?.name || 'Unknown'}*`,
        dl.title ? `📝 ${dl.title}` : null,
        dl.duration ? `⏱️ *Duration:* ${dl.duration}s` : null,
        ``,
        `> ${config.BOT_NAME}`,
      ].filter(Boolean).join('\n');
      await conn.sendMessage(m.from, {
        video: { url: dl.video },
        mimetype: 'video/mp4',
        fileName: 'tiktok.mp4',
        caption,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await conn.sendMessage(m.from, { delete: status?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *TikTok Failed*\n\n${err.message}\n\nMake sure you paste a valid TikTok link.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── MEDIAFIRE ───────────────────────────────────────────────────────────
  if (['mediafire', 'mf', 'mfdl'].includes(cmd)) {
    if (!q || !q.includes('mediafire')) return m.reply(`❌ Usage: ${p}mediafire <MediaFire URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📦');
    try {
      const { default: axios } = await import('axios');
      const res = await axios.get(q, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const match = res.data.match(/href="(https:\/\/download\d*\.mediafire\.com[^"]+)"/);
      if (!match) throw new Error('Direct download link not found');
      await m.reply(`📦 *MediaFire Direct Link*\n\n🔗 ${match[1]}\n\n_Click to download_\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *MediaFire Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TERABOX ─────────────────────────────────────────────────────────────
  if (['terabox', 'tb', 'tbdl'].includes(cmd)) {
    if (!q || !q.includes('terabox')) return m.reply(`❌ Usage: ${p}terabox <TeraBox URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📦');
    try {
      const { default: axios } = await import('axios');
      const res = await axios.get(`https://terabox.fun/api?url=${encodeURIComponent(q)}`, { timeout: 15000 });
      const data = res.data;
      if (!data?.download_link && !data?.link) throw new Error('No download link found');
      const link = data.download_link || data.link;
      await m.reply(`📦 *TeraBox Direct Link*\n\n📛 *File:* ${data.filename || 'Unknown'}\n📊 *Size:* ${data.size || 'Unknown'}\n\n🔗 ${link}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *TeraBox Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── INSTAGRAM / FACEBOOK / TWITTER / SOUNDCLOUD / CAPCUT / PINTEREST ────
  if (['instagram', 'ig', 'igdl', 'insta', 'facebook', 'fb', 'fbdl', 'fbvideo',
       'twitter', 'x', 'xdl', 'twitterdl', 'soundcloud', 'sc', 'scdl',
       'capcut', 'cap', 'capcutdl', 'pinterest', 'pin', 'pindl', 'pinimg'].includes(cmd)) {
    return m.reply(
`⚠️ *${cmd.toUpperCase()} — Not Supported*
━━━━━━━━━━━━━━━━━━━━━

This platform isn't supported yet.

*What works right now:*
• ${p}play <song name> — YouTube audio
• ${p}pv <song name> — YouTube video
• ${p}tiktok <url> — TikTok (no watermark)
• ${p}yts <song> — YouTube search
• ${p}mediafire <url> — MediaFire links

> ${config.BOT_NAME}`);
  }
};

export default downloader;
