import config from '../config.cjs';
import axios from 'axios';
import { sendBtn } from '../lib/sendBtn.js';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

async function gApi(path, params = {}) {
  const res = await axios.get(`${API}/${path}`, { params: { apikey: KEY, ...params }, timeout: 60000 });
  return res.data;
}

const downloader = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── YOUTUBE MP3 ───
  if (['ytmp3', 'ytaudio', 'yta', 'musicdl'].includes(cmd)) {
    if (!q) return sendBtn(conn, m.from, {
      body: `🎵 *YouTube → Audio Downloader*\n\n❌ No URL or song name provided!\n\n*Usage:* ${config.PREFIX}ytmp3 <YouTube URL or song name>\n\n*Examples:*\n• ${config.PREFIX}ytmp3 https://youtube.com/watch?v=...\n• ${config.PREFIX}ytmp3 faded alan walker`,
      footer: config.BOT_NAME,
      buttons: [
        { text: `📹 Get Video`, id: `${config.PREFIX}ytmp4` },
        { text: `▶️ Play Music`, id: `${config.PREFIX}play faded alan walker` },
      ],
    }, m);

    await m.React('🎵');
    await m.reply(`🔍 *Searching...* "${q}"`);
    try {
      const isUrl = q.includes('youtu');
      const data = await gApi('downloader/ytmp3', isUrl ? { url: q } : { q });
      const r = data?.result || data;
      if (!r) throw new Error('No result from API');
      const dlUrl = r?.audio_url || r?.audio || r?.download?.url || r?.url || r?.mp3;
      if (!dlUrl) throw new Error('No audio download URL in response');
      await conn.sendMessage(m.from, {
        audio: { url: dlUrl },
        mimetype: 'audio/mpeg',
        fileName: `${r?.title || q}.mp3`,
        ptt: false,
      }, { quoted: { key: m.key, message: m.message } });
      await sendBtn(conn, m.from, {
        body: `✅ *Downloaded Successfully!*\n\n🎵 *Title:* ${r?.title || q}\n⏱️ *Duration:* ${r?.duration || 'N/A'}\n🎤 *Artist:* ${r?.artist || 'N/A'}`,
        footer: `${config.BOT_NAME} | YouTube`,
        buttons: [
          { text: `📹 Get Video`, id: `${config.PREFIX}ytmp4 ${q}` },
          { text: `🎵 More Music`, id: `${config.PREFIX}play ${q}` },
        ],
      }, m);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Download Failed*\n\n${err?.response?.data?.message || err.message}\n\n_Try: ${config.PREFIX}play ${q}_`);
    }
    return;
  }

  // ─── YOUTUBE MP4 ───
  if (['ytmp4', 'ytvideo', 'ytv', 'videodl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ytmp4 <YouTube URL or video name>`);
    await m.React('📹');
    await m.reply(`🔍 *Searching...* "${q}"`);
    try {
      const isUrl = q.includes('youtu');
      const data = await gApi('downloader/ytmp4', isUrl ? { url: q } : { q });
      const r = data?.result || data;
      if (!r) throw new Error('No result');
      const dlUrl = r?.video_url || r?.video || r?.download?.url || r?.url || r?.mp4;
      if (!dlUrl) throw new Error('No video download URL');
      await conn.sendMessage(m.from, {
        video: { url: dlUrl },
        caption: `📹 *${r?.title || q}*\n\n> ${config.BOT_NAME}`,
        fileName: `${r?.title || q}.mp4`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Video Download Failed*\n\n${err?.response?.data?.message || err.message}\n\n_Try audio: ${config.PREFIX}ytmp3 ${q}_`);
    }
    return;
  }

  // ─── PLAY (Search + Download) ───
  if (['play', 'music', 'song'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}play <song name>`);
    await m.React('▶️');
    await m.reply(`🔍 *Searching for "${q}"...*`);
    try {
      const { default: ytSearch } = await import('yt-search');
      const res = await ytSearch(q);
      const video = res.videos?.[0];
      if (!video) throw new Error('No video found');
      const dlData = await gApi('downloader/ytmp3', { url: video.url });
      const r = dlData?.result || dlData;
      const dlUrl = r?.audio_url || r?.audio || r?.url;
      if (!dlUrl) throw new Error('No download URL');
      await conn.sendMessage(m.from, {
        audio: { url: dlUrl },
        mimetype: 'audio/mpeg',
        fileName: `${video.title}.mp3`,
        ptt: false,
      }, { quoted: { key: m.key, message: m.message } });
      await sendBtn(conn, m.from, {
        image: video.thumbnail,
        body: `🎵 *Now Playing!*\n\n📌 *Title:* ${video.title}\n⏱️ *Duration:* ${video.timestamp}\n👁️ *Views:* ${video.views?.toLocaleString() || 'N/A'}\n🔗 ${video.url}`,
        footer: `${config.BOT_NAME} | YouTube`,
        buttons: [
          { text: `📹 Get Video`, id: `${config.PREFIX}ytmp4 ${video.url}` },
          { text: `🎵 More Like This`, id: `${config.PREFIX}play ${q}` },
        ],
      }, m);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Play failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── TIKTOK ───
  if (['tiktok', 'tt', 'ttdl', 'tiktokdl'].includes(cmd)) {
    if (!q || !q.includes('tiktok')) return m.reply(`❌ Usage: ${config.PREFIX}tiktok <TikTok URL>`);
    await m.React('🎵');
    await m.reply(`⬇️ *Downloading TikTok...*`);
    try {
      const data = await gApi('downloader/tiktok', { url: q });
      const r = data?.result || data;
      if (!r) throw new Error('No result');
      const videoUrl = r?.video_url || r?.video || r?.url || r?.nowm;
      if (!videoUrl) throw new Error('No video URL');
      await conn.sendMessage(m.from, {
        video: { url: videoUrl },
        caption: `🎵 *TikTok Downloaded!*\n\n📌 *Title:* ${r?.title || 'TikTok Video'}\n🎤 *Author:* ${r?.author || r?.username || 'N/A'}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ TikTok download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── INSTAGRAM ───
  if (['instagram', 'ig', 'igdl', 'insta'].includes(cmd)) {
    if (!q || !q.includes('instagram')) return m.reply(`❌ Usage: ${config.PREFIX}instagram <Instagram URL>`);
    await m.React('📸');
    await m.reply(`⬇️ *Downloading Instagram...*`);
    try {
      const data = await gApi('downloader/instagram', { url: q });
      const r = data?.result || data;
      const mediaUrl = r?.url || r?.video_url || r?.image_url || r?.media;
      if (!mediaUrl) throw new Error('No media URL');
      const isVideo = r?.type === 'video' || !!r?.video_url;
      await conn.sendMessage(m.from, {
        [isVideo ? 'video' : 'image']: { url: mediaUrl },
        caption: `📸 *Instagram Download*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Instagram download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── FACEBOOK ───
  if (['facebook', 'fb', 'fbdl', 'fbvideo'].includes(cmd)) {
    if (!q || !q.includes('facebook')) return m.reply(`❌ Usage: ${config.PREFIX}facebook <Facebook URL>`);
    await m.React('📘');
    await m.reply(`⬇️ *Downloading Facebook video...*`);
    try {
      const data = await gApi('downloader/facebook', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.video_url || r?.hd || r?.sd;
      if (!dlUrl) throw new Error('No URL');
      await conn.sendMessage(m.from, { video: { url: dlUrl }, caption: `📘 *Facebook Download*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Facebook download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── TWITTER / X ───
  if (['twitter', 'x', 'xdl', 'twitterdl', 'xvideo'].includes(cmd)) {
    if (!q || !(q.includes('twitter') || q.includes('x.com'))) return m.reply(`❌ Usage: ${config.PREFIX}twitter <Twitter/X URL>`);
    await m.React('🐦');
    await m.reply(`⬇️ *Downloading Twitter/X media...*`);
    try {
      const data = await gApi('downloader/twitter', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.video_url || r?.media;
      if (!dlUrl) throw new Error('No URL');
      await conn.sendMessage(m.from, { video: { url: dlUrl }, caption: `🐦 *Twitter/X Download*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Twitter download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── SPOTIFY ───
  if (['spotify', 'spotifydl', 'sp'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}spotify <Spotify URL or song name>`);
    await m.React('🎧');
    await m.reply(`⬇️ *Fetching Spotify track...*`);
    try {
      const isUrl = q.includes('spotify');
      const data = await gApi('downloader/spotify', isUrl ? { url: q } : { q });
      const r = data?.result || data;
      const dlUrl = r?.audio_url || r?.audio || r?.download;
      if (!dlUrl) throw new Error('No audio URL');
      await conn.sendMessage(m.from, {
        audio: { url: dlUrl },
        mimetype: 'audio/mpeg',
        fileName: `${r?.title || q}.mp3`,
        ptt: false,
      }, { quoted: { key: m.key, message: m.message } });
      await sendBtn(conn, m.from, {
        body: `✅ *Spotify Track Downloaded!*\n\n🎵 *Title:* ${r?.title || q}\n🎤 *Artist:* ${r?.artist || r?.artists || 'N/A'}\n⏱️ *Duration:* ${r?.duration || 'N/A'}`,
        footer: `${config.BOT_NAME} | Spotify`,
        buttons: [{ text: `🔄 Download Again`, id: `${config.PREFIX}spotify ${q}` }],
      }, m);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Spotify failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── PINTEREST ───
  if (['pinterest', 'pin', 'pinterestdl', 'pinimage'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}pinterest <URL or search term>`);
    await m.React('📌');
    try {
      const isUrl = q.includes('pinterest');
      const data = await gApi(isUrl ? 'downloader/pinterest' : 'search/pinterest', isUrl ? { url: q } : { q });
      const r = data?.result || data;
      const imgUrl = r?.url || r?.image_url || r?.image || (Array.isArray(r) ? r[0]?.url : null);
      if (!imgUrl) throw new Error('No image URL');
      await conn.sendMessage(m.from, {
        image: { url: imgUrl },
        caption: `📌 *Pinterest Image*\n\n${isUrl ? '' : `🔍 *Search:* ${q}\n`}\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Pinterest failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── CAPCUT ───
  if (['capcut', 'capcutdl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}capcut <CapCut URL>`);
    await m.React('🎬');
    await m.reply(`⬇️ *Downloading CapCut video...*`);
    try {
      const data = await gApi('downloader/capcut', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.video_url || r?.video;
      if (!dlUrl) throw new Error('No URL');
      await conn.sendMessage(m.from, { video: { url: dlUrl }, caption: `🎬 *CapCut Download*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ CapCut download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── MEDIAFIRE ───
  if (['mediafire', 'mf', 'mfdl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}mediafire <MediaFire URL>`);
    await m.React('📁');
    await m.reply(`⬇️ *Fetching MediaFire link...*`);
    try {
      const data = await gApi('downloader/mediafire', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.download_url || r?.download;
      if (!dlUrl) throw new Error('No URL');
      await m.reply(`📁 *MediaFire Download Link*\n\n📥 *File:* ${r?.filename || r?.name || 'File'}\n📦 *Size:* ${r?.size || 'N/A'}\n\n🔗 *Download:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ MediaFire failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── TERABOX ───
  if (['terabox', 'tera', 'teraboxdl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}terabox <TeraBox URL>`);
    await m.React('📦');
    await m.reply(`⬇️ *Fetching TeraBox link...*`);
    try {
      const data = await gApi('downloader/terabox', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.download_url || r?.download;
      if (!dlUrl) throw new Error('No URL');
      await m.reply(`📦 *TeraBox Download*\n\n📥 *File:* ${r?.filename || r?.name || 'File'}\n\n🔗 *Link:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ TeraBox failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── GOOGLE DRIVE ───
  if (['gdrive', 'googledrive', 'gdrivedownload'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}gdrive <Google Drive URL>`);
    await m.React('☁️');
    await m.reply(`⬇️ *Fetching Google Drive link...*`);
    try {
      const data = await gApi('downloader/gdrive', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.download_url;
      if (!dlUrl) throw new Error('No URL');
      await m.reply(`☁️ *Google Drive Download*\n\n📥 *File:* ${r?.filename || r?.name || 'File'}\n\n🔗 *Link:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Google Drive failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── AIO (Auto Detect) ───
  if (['aio', 'auto', 'autodownload'].includes(cmd)) {
    if (!q || !q.startsWith('http')) return m.reply(`❌ Usage: ${config.PREFIX}aio <URL>\n\nSupports: YouTube, TikTok, Instagram, Facebook, Twitter, Pinterest, Spotify and more!`);
    await m.React('⬇️');
    await m.reply(`🔍 *Auto-detecting and downloading...*`);
    try {
      const data = await gApi('downloader/aio', { url: q });
      const r = data?.result || data;
      const mediaUrl = r?.url || r?.video_url || r?.audio_url || r?.media;
      if (!mediaUrl) throw new Error('No media URL');
      const isAudio = mediaUrl.includes('.mp3') || r?.type === 'audio';
      if (isAudio) {
        await conn.sendMessage(m.from, { audio: { url: mediaUrl }, mimetype: 'audio/mpeg', ptt: false }, { quoted: { key: m.key, message: m.message } });
      } else {
        await conn.sendMessage(m.from, { video: { url: mediaUrl }, caption: `⬇️ *Auto Downloaded*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Auto download failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── GIT CLONE ───
  if (['gitclone', 'gh-clone', 'githubclone'].includes(cmd)) {
    if (!q || !q.includes('github')) return m.reply(`❌ Usage: ${config.PREFIX}gitclone <GitHub Repo URL>`);
    await m.React('💻');
    try {
      const data = await gApi('downloader/gitclone', { url: q });
      const r = data?.result || data;
      const dlUrl = r?.url || r?.download_url || r?.download;
      if (!dlUrl) throw new Error('No URL');
      await m.reply(`💻 *GitHub Clone*\n\n📦 *Repo:* ${q.replace('https://github.com/', '')}\n\n🔗 *Download ZIP:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Git clone failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }
};

export default downloader;
