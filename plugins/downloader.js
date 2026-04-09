import config from '../config.cjs';
import { tiktokDl, ytSearch as beraYtSearch } from '../lib/beraapi.js';

const p = config.PREFIX;

function fmtViews(n) {
  if (!n) return 'N/A';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── "Not available" reply ────────────────────────────────────────────────────
function notAvailable(m, cmd) {
  return m.reply(
`⚠️ *${cmd.toUpperCase()} — Currently Unavailable*
━━━━━━━━━━━━━━━━━━━━━

This download feature requires an external tool that is not loaded.

*What still works:*
• ${p}tiktok <TikTok URL> — download TikTok videos (no watermark)
• ${p}yts <song name> — search YouTube results
• ${p}lyrics <song name> — get song lyrics

> ${config.BOT_NAME}`);
}

const downloader = async (m, conn) => {
  if (!m.body) return;

  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');
  const quoted = { quoted: { key: m.key, message: m.message } };

  // ─── PLAY / YTMP3 / PV / YTMP4 — YouTube downloads ───────────────────────
  if (['play', 'music', 'song', 'pl', 'ytmp3', 'ytaudio', 'yt2mp3', 'ytmusic',
       'pv', 'playvid', 'musicvideo', 'mv', 'ytmp4', 'ytvideo', 'yt2mp4', 'ytv',
       'playaudio', 'plaudio', 'pa', 'playvideo', 'plvideo',
       'spotify', 'sp', 'spotdl', 'spmusic',
       'soundcloud', 'sc', 'scdl',
       'instagram', 'ig', 'igdl', 'insta',
       'facebook', 'fb', 'fbdl', 'fbvideo',
       'twitter', 'x', 'xdl', 'twitterdl',
       'pinterest', 'pin', 'pindl', 'pinimg',
       'capcut', 'cap', 'capcutdl'].includes(cmd)) {
    return notAvailable(m, cmd);
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
💡 To play on TikTok: ${p}tiktok <url>

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
};

export default downloader;
