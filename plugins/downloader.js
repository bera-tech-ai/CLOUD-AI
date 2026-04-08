import config from '../config.cjs';
import fs from 'fs';
import { downloadAudio, downloadVideo, ytSearch, getInfo } from '../lib/ytdlp.js';
import { sendBtn } from '../lib/sendBtn.js';

const p = config.PREFIX;

// ─── Format numbers ───────────────────────────────────────────────────────────
function fmtViews(n) {
  if (!n) return 'N/A';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── Build a "Now Playing" card caption ───────────────────────────────────────
function buildCard(meta, platform = 'YouTube') {
  return [
    `🎵 *${meta.title || 'Unknown'}*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🎤 *Artist:* ${meta.uploader || 'Unknown'}`,
    `⏱️ *Duration:* ${meta.duration || '?:??'}`,
    meta.views ? `👁️ *Views:* ${fmtViews(meta.views)}` : null,
    `🌐 *Platform:* ${platform}`,
    `🔗 ${meta.url || ''}`,
    ``,
    `> ${config.BOT_NAME}`,
  ].filter(l => l !== null).join('\n');
}

// ─── Safely send a file then delete it ────────────────────────────────────────
async function sendFile(conn, m, file, type, caption, meta) {
  const quoted = { quoted: { key: m.key, message: m.message } };
  try {
    const buffer = fs.readFileSync(file);
    await conn.sendMessage(m.from, { [type]: buffer, caption: caption || undefined, ...meta }, quoted);
  } finally {
    try { fs.unlinkSync(file); } catch {}
  }
}

// ─── Download audio and send ─────────────────────────────────────────────────
async function doAudioDownload(conn, m, top) {
  const q = { quoted: { key: m.key, message: m.message } };
  const status = await conn.sendMessage(m.from, { text: `⬇️ *Downloading MP3...*\n\n🎵 *${top.title}*` }, q);
  try {
    const dl = await downloadAudio(top.url, { quality: '5' });
    await conn.sendMessage(m.from, { delete: status.key }).catch(() => null);
    if (dl.thumbnail) {
      await conn.sendMessage(m.from, { image: { url: dl.thumbnail }, caption: buildCard({ ...dl, url: top.url }) }, q);
    }
    await sendFile(conn, m, dl.file, 'audio', null, {
      mimetype: 'audio/mpeg',
      fileName: `${(dl.title || top.title).replace(/[^\w\s-]/g, '').trim()}.mp3`,
      ptt: false,
    });
    await m.React('✅');
  } catch (err) {
    await conn.sendMessage(m.from, { delete: status?.key }).catch(() => null);
    await m.React('❌');
    await m.reply(`❌ *Audio Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
  }
}

// ─── Download video and send ─────────────────────────────────────────────────
async function doVideoDownload(conn, m, top) {
  const q = { quoted: { key: m.key, message: m.message } };
  const status = await conn.sendMessage(m.from, { text: `⬇️ *Downloading Video...*\n\n🎵 *${top.title}*` }, q);
  try {
    const dl = await downloadVideo(top.url, { quality: '720', maxSize: '100m' });
    await conn.sendMessage(m.from, { delete: status.key }).catch(() => null);
    await sendFile(conn, m, dl.file, 'video', buildCard({ ...dl, url: top.url }), {
      mimetype: 'video/mp4',
      fileName: `${(dl.title || top.title).replace(/[^\w\s-]/g, '').trim()}.mp4`,
    });
    await m.React('✅');
  } catch (err) {
    await conn.sendMessage(m.from, { delete: status?.key }).catch(() => null);
    await m.React('❌');
    await m.reply(`❌ *Video Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
  }
}

const downloader = async (m, conn) => {
  if (!m.body) return;

  // ─── Button tap handler: play_audio / play_video ─────────────────────────
  if (m.selectedId && ['play_audio', 'play_video'].includes(m.selectedId)) {
    const cached = global._playCache?.get(m.from + ':' + m.sender);
    if (!cached) {
      return m.reply(`❌ No recent search. Use ${p}play <song name> first.\n\n> ${config.BOT_NAME}`);
    }
    if (m.selectedId === 'play_audio') {
      await m.React('🎵');
      await doAudioDownload(conn, m, cached.top);
    } else {
      await m.React('🎬');
      await doVideoDownload(conn, m, cached.top);
    }
    return;
  }

  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');
  const quoted = { quoted: { key: m.key, message: m.message } };

  // ─── PLAY (search YouTube + show interactive audio/video buttons) ─────────
  if (['play', 'music', 'song', 'pl'].includes(cmd)) {
    if (!q) return m.reply(
`▶️ *Play Music*

Usage: ${p}play <song name>

Examples:
• ${p}play faded alan walker
• ${p}play bad bunny un verano sin ti
• ${p}play diamonds rihanna

> ${config.BOT_NAME}`);

    await m.React('🔍');
    const searching = await conn.sendMessage(m.from, { text: `🔍 *Searching...*\n\n_"${q}"_` }, quoted);

    try {
      const results = await ytSearch(q, 1);
      if (!results.length) throw new Error('No results found for that query');
      const top = results[0];

      await conn.sendMessage(m.from, { delete: searching.key }).catch(() => null);

      const card = [
        `🎵 *${top.title || 'Unknown'}*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `🎤 *Artist:* ${top.uploader || 'Unknown'}`,
        `⏱️ *Duration:* ${top.duration || '?:??'}`,
        top.views ? `👁️ *Views:* ${fmtViews(top.views)}` : null,
        `🔗 ${top.url}`,
        ``,
        `Choose format below:`,
      ].filter(l => l !== null).join('\n');

      const imgUrl = top.thumbnail ||
        `https://i.ytimg.com/vi/${top.url.split('v=')[1]}/hqdefault.jpg`;

      await sendBtn(conn, m.from, {
        title: `🎵 ${config.BOT_NAME}`,
        body: card,
        footer: config.BOT_NAME,
        image: imgUrl,
        buttons: [
          { id: 'play_audio', text: '🎵 Audio MP3' },
          { id: 'play_video', text: '🎬 Video MP4' },
        ],
      }, m);

      if (!global._playCache) global._playCache = new Map();
      global._playCache.set(m.from + ':' + m.sender, { top, q, ts: Date.now() });

      await m.React('✅');
    } catch (err) {
      await conn.sendMessage(m.from, { delete: searching?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *Play Failed*\n\n${err.message}\n\nTry: ${p}play faded alan walker\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PLAY AUDIO (direct, also usable as button fallback) ─────────────────
  if (['playaudio', 'plaudio', 'pa'].includes(cmd)) {
    const query = q || global._playCache?.get(m.from + ':' + m.sender)?.q;
    if (!query) return m.reply(`❌ Usage: ${p}playaudio <song name>\n\n> ${config.BOT_NAME}`);
    await m.React('🎵');
    const searching2 = await conn.sendMessage(m.from, { text: `🔍 *Searching...*\n\n_"${query}"_` }, quoted);
    try {
      const results2 = await ytSearch(query, 1);
      if (!results2.length) throw new Error('No results found');
      await conn.sendMessage(m.from, { delete: searching2.key }).catch(() => null);
      await doAudioDownload(conn, m, results2[0]);
    } catch (err) {
      await conn.sendMessage(m.from, { delete: searching2?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *Audio Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PLAY VIDEO (direct) ─────────────────────────────────────────────────
  if (['playvideo', 'plvideo', 'pv'].includes(cmd)) {
    const query = q || global._playCache?.get(m.from + ':' + m.sender)?.q;
    if (!query) return m.reply(`❌ Usage: ${p}playvideo <song name>\n\n> ${config.BOT_NAME}`);
    await m.React('🎬');
    const searching3 = await conn.sendMessage(m.from, { text: `🔍 *Searching...*\n\n_"${query}"_` }, quoted);
    try {
      const results3 = await ytSearch(query, 1);
      if (!results3.length) throw new Error('No results found');
      await conn.sendMessage(m.from, { delete: searching3.key }).catch(() => null);
      await doVideoDownload(conn, m, results3[0]);
    } catch (err) {
      await conn.sendMessage(m.from, { delete: searching3?.key }).catch(() => null);
      await m.React('❌');
      await m.reply(`❌ *Video Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── YOUTUBE SEARCH ───────────────────────────────────────────────────────
  if (['yts', 'ytsearch', 'searchyt', 'ytsong'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}yts <search query>\n\n> ${config.BOT_NAME}`);
    await m.React('🔍');
    try {
      const results = await ytSearch(q, 5);
      if (!results.length) throw new Error('No results found');
      const list = results.map((v, i) =>
        `*${i + 1}.* ${v.title}\n    🎤 ${v.uploader} | ⏱️ ${v.duration} | 👁️ ${fmtViews(v.views)}\n    🔗 ${v.url}`
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

  // ─── YOUTUBE MP3 ─────────────────────────────────────────────────────────
  if (['ytmp3', 'ytaudio', 'yt2mp3', 'ytmusic'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}ytmp3 <YouTube URL or song name>\n\nExamples:\n• ${p}ytmp3 https://youtu.be/dQw4w9WgXcQ\n• ${p}ytmp3 never gonna give you up\n\n> ${config.BOT_NAME}`);
    await m.React('🎵');
    let url = q;
    if (!q.includes('youtu')) {
      await m.reply(`🔍 *Searching YouTube...*`);
      const results = await ytSearch(q, 1);
      if (!results.length) { await m.React('❌'); return m.reply(`❌ No results found.\n\n> ${config.BOT_NAME}`); }
      url = results[0].url;
    }
    await m.reply(`⬇️ *Downloading MP3...*`);
    try {
      const dl = await downloadAudio(url, { quality: '5' });
      if (dl.thumbnail) {
        await conn.sendMessage(m.from, { image: { url: dl.thumbnail }, caption: buildCard({ ...dl, url }) }, quoted);
      }
      await sendFile(conn, m, dl.file, 'audio', null, {
        mimetype: 'audio/mpeg',
        fileName: `${(dl.title || 'audio').replace(/[^\w\s-]/g, '').trim()}.mp3`,
        ptt: false,
      });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Download Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── YOUTUBE MP4 ─────────────────────────────────────────────────────────
  if (['ytmp4', 'ytvideo', 'yt2mp4', 'ytv'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}ytmp4 <YouTube URL or name>\n\n> ${config.BOT_NAME}`);
    await m.React('🎬');
    let url = q;
    if (!q.includes('youtu')) {
      await m.reply(`🔍 *Searching YouTube...*`);
      const results = await ytSearch(q, 1);
      if (!results.length) { await m.React('❌'); return m.reply(`❌ No results found.\n\n> ${config.BOT_NAME}`); }
      url = results[0].url;
    }
    await m.reply(`⬇️ *Downloading 720p video...*`);
    try {
      const dl = await downloadVideo(url, { quality: '720', maxSize: '100m' });
      await sendFile(conn, m, dl.file, 'video', buildCard({ ...dl, url }), {
        mimetype: 'video/mp4',
        fileName: `${(dl.title || 'video').replace(/[^\w\s-]/g, '').trim()}.mp4`,
      });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Download Failed*\n\n${err.message}\n\nTry a shorter video.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TIKTOK ──────────────────────────────────────────────────────────────
  if (['tiktok', 'tt', 'ttdl', 'tiktokdl'].includes(cmd)) {
    if (!q || !q.includes('tiktok')) return m.reply(`❌ Usage: ${p}tiktok <TikTok URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🎵');
    await m.reply(`⬇️ *Downloading TikTok (no watermark)...*`);
    try {
      const dl = await downloadVideo(q, { quality: 'best' });
      await sendFile(conn, m, dl.file, 'video',
        `🎵 *TikTok Downloaded!*\n📛 ${dl.title || 'Video'}\n\n> ${config.BOT_NAME}`,
        { mimetype: 'video/mp4', fileName: 'tiktok.mp4' }
      );
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *TikTok Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── INSTAGRAM ───────────────────────────────────────────────────────────
  if (['instagram', 'ig', 'igdl', 'insta'].includes(cmd)) {
    if (!q || !q.includes('instagram')) return m.reply(`❌ Usage: ${p}ig <Instagram URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📸');
    await m.reply(`⬇️ *Downloading Instagram post...*`);
    try {
      const dl = await downloadVideo(q, { quality: 'best' }).catch(() => null)
              || await downloadAudio(q).then(a => ({ ...a, isAudio: true }));
      if (dl.isAudio) {
        await sendFile(conn, m, dl.file, 'audio', `📸 *Instagram Downloaded!*\n\n> ${config.BOT_NAME}`, { mimetype: 'audio/mpeg', fileName: 'instagram.mp3' });
      } else {
        await sendFile(conn, m, dl.file, 'video', `📸 *Instagram Downloaded!*\n📛 ${dl.title || 'Post'}\n\n> ${config.BOT_NAME}`, { mimetype: 'video/mp4', fileName: 'instagram.mp4' });
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Instagram Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── FACEBOOK ────────────────────────────────────────────────────────────
  if (['facebook', 'fb', 'fbdl', 'fbvideo'].includes(cmd)) {
    if (!q || !(q.includes('facebook') || q.includes('fb.watch'))) return m.reply(`❌ Usage: ${p}fb <Facebook video URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📘');
    await m.reply(`⬇️ *Downloading Facebook video...*`);
    try {
      const dl = await downloadVideo(q, { quality: '720' });
      await sendFile(conn, m, dl.file, 'video', `📘 *Facebook Video!*\n📛 ${dl.title || 'Video'}\n\n> ${config.BOT_NAME}`, { mimetype: 'video/mp4', fileName: 'facebook.mp4' });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Facebook Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TWITTER/X ───────────────────────────────────────────────────────────
  if (['twitter', 'x', 'xdl', 'twitterdl'].includes(cmd)) {
    if (!q || !(q.includes('twitter') || q.includes('x.com') || q.includes('t.co'))) return m.reply(`❌ Usage: ${p}twitter <Twitter/X URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🐦');
    await m.reply(`⬇️ *Downloading Twitter/X media...*`);
    try {
      const dl = await downloadVideo(q, { quality: 'best' });
      await sendFile(conn, m, dl.file, 'video', `🐦 *Twitter/X Downloaded!*\n📛 ${dl.title || 'Post'}\n\n> ${config.BOT_NAME}`, { mimetype: 'video/mp4', fileName: 'twitter.mp4' });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Twitter Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SPOTIFY ─────────────────────────────────────────────────────────────
  if (['spotify', 'sp', 'spotdl', 'spmusic'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}spotify <song name or Spotify URL>\n\n> ${config.BOT_NAME}`);
    await m.React('💚');
    let searchQuery = q;
    if (q.includes('spotify.com/track')) {
      await m.reply(`🔍 *Getting Spotify track info...*`);
      try { const info = await getInfo(q); searchQuery = info.title || q; } catch {}
    }
    await m.reply(`🔍 *Searching YouTube for "${searchQuery}"...*`);
    try {
      const results = await ytSearch(searchQuery, 1);
      if (!results.length) throw new Error('Track not found on YouTube');
      const top = results[0];
      await m.reply(`⬇️ *Downloading...*`);
      const dl = await downloadAudio(top.url, { quality: '5' });
      if (dl.thumbnail || top.thumbnail) {
        await conn.sendMessage(m.from, {
          image: { url: dl.thumbnail || top.thumbnail },
          caption: buildCard({ ...dl, url: top.url }, 'Spotify → YouTube'),
        }, quoted);
      }
      await sendFile(conn, m, dl.file, 'audio', null, {
        mimetype: 'audio/mpeg',
        fileName: `${(dl.title || searchQuery).replace(/[^\w\s-]/g, '').trim()}.mp3`,
        ptt: false,
      });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Spotify Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PINTEREST ───────────────────────────────────────────────────────────
  if (['pinterest', 'pin', 'pindl', 'pinimg'].includes(cmd)) {
    if (!q || !q.includes('pinterest')) return m.reply(`❌ Usage: ${p}pinterest <Pinterest URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📌');
    await m.reply(`⬇️ *Downloading Pinterest media...*`);
    try {
      const dl = await downloadVideo(q, { quality: 'best' }).catch(() => null);
      if (dl) {
        await sendFile(conn, m, dl.file, 'video', `📌 *Pinterest Downloaded!*\n\n> ${config.BOT_NAME}`, { mimetype: 'video/mp4', fileName: 'pinterest.mp4' });
      } else {
        const info = await getInfo(q);
        if (info.thumbnail) {
          await conn.sendMessage(m.from, { image: { url: info.thumbnail }, caption: `📌 *Pinterest Image!*\n\n> ${config.BOT_NAME}` }, quoted);
        } else throw new Error('No media found');
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Pinterest Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── CAPCUT ──────────────────────────────────────────────────────────────
  if (['capcut', 'cap', 'capcutdl'].includes(cmd)) {
    if (!q || !q.includes('capcut')) return m.reply(`❌ Usage: ${p}capcut <CapCut URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🎬');
    await m.reply(`⬇️ *Downloading CapCut video...*`);
    try {
      const dl = await downloadVideo(q, { quality: 'best' });
      await sendFile(conn, m, dl.file, 'video', `🎬 *CapCut Downloaded!*\n📛 ${dl.title || 'Video'}\n\n> ${config.BOT_NAME}`, { mimetype: 'video/mp4', fileName: 'capcut.mp4' });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *CapCut Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SOUNDCLOUD ──────────────────────────────────────────────────────────
  if (['soundcloud', 'sc', 'scdl'].includes(cmd)) {
    if (!q || !q.includes('soundcloud')) return m.reply(`❌ Usage: ${p}soundcloud <SoundCloud URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🎧');
    await m.reply(`⬇️ *Downloading SoundCloud track...*`);
    try {
      const dl = await downloadAudio(q, { quality: '0' });
      if (dl.thumbnail) {
        await conn.sendMessage(m.from, { image: { url: dl.thumbnail }, caption: buildCard(dl, 'SoundCloud') }, quoted);
      }
      await sendFile(conn, m, dl.file, 'audio', null, { mimetype: 'audio/mpeg', fileName: `${(dl.title || 'track').replace(/[^\w\s-]/g, '').trim()}.mp3`, ptt: false });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *SoundCloud Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
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
      await m.reply(`📦 *TeraBox Direct Link*\n\n📛 ${data.file_name || 'File'}\n💾 ${data.size || 'Unknown'}\n🔗 ${link}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *TeraBox Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── GOOGLE DRIVE ────────────────────────────────────────────────────────
  if (['gdrive', 'gd', 'gdrivedl'].includes(cmd)) {
    if (!q || !q.includes('drive.google')) return m.reply(`❌ Usage: ${p}gdrive <Google Drive URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📁');
    try {
      const match = q.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) throw new Error('Invalid Google Drive URL format');
      const directLink = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      await m.reply(`📁 *Google Drive Direct Link*\n\n🔗 ${directLink}\n\n_Note: Large files may require login_\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Google Drive Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default downloader;
