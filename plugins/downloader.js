import config from '../config.cjs';
import axios from 'axios';

// ─── Cobalt.tools — free, no API key, supports 20+ platforms ─────────────────
// Supports: YouTube, TikTok, Instagram, Twitter/X, Facebook, Pinterest,
//           Reddit, SoundCloud, Vimeo, Twitch, Bilibili, and more
const COBALT = 'https://api.cobalt.tools';

async function cobalt(url, mode = 'auto', quality = '720') {
  const res = await axios.post(`${COBALT}/`, {
    url,
    downloadMode: mode,   // 'auto' | 'audio' | 'mute'
    videoQuality: quality,
    filenameStyle: 'pretty',
    twitterGif: false,
    youtubeDubLang: 'en',
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 45000,
  });
  const d = res.data;
  if (d.status === 'error') throw new Error(d.error?.code || 'cobalt error');
  // status: redirect | tunnel → d.url
  // status: picker → d.picker[0].url
  if (d.status === 'picker') return { url: d.picker[0]?.url, all: d.picker };
  if (d.url) return { url: d.url };
  throw new Error('No download URL in cobalt response');
}

// ─── YouTube info via yt-search ───────────────────────────────────────────────
async function ytSearch(q) {
  const { default: yts } = await import('yt-search');
  const res = await yts(q);
  return res.videos?.[0] || null;
}

// ─── Format filesize ──────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return 'N/A';
  const mb = bytes / 1048576;
  return mb > 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

const p = config.PREFIX;

const downloader = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');
  const quoted = { quoted: { key: m.key, message: m.message } };

  // ─── YOUTUBE MP3 ──────────────────────────────────────────────────────────
  if (['ytmp3', 'ytaudio', 'yta', 'musicdl'].includes(cmd)) {
    if (!q) return m.reply(`🎵 *YouTube → MP3*\n\nUsage: ${p}ytmp3 <YouTube URL or song name>\n\nExamples:\n• ${p}ytmp3 https://youtu.be/dQw4w9WgXcQ\n• ${p}ytmp3 faded alan walker\n\n> ${config.BOT_NAME}`);
    await m.React('🎵');
    await m.reply(`🔍 *Searching...* _"${q}"_`);
    try {
      let url = q;
      let title = q, duration = '', artist = '', thumb = '';
      if (!q.includes('youtu')) {
        const vid = await ytSearch(q);
        if (!vid) throw new Error('No YouTube results found');
        url = vid.url;
        title = vid.title;
        duration = vid.timestamp;
        artist = vid.author?.name || '';
        thumb = vid.thumbnail;
      }
      const result = await cobalt(url, 'audio');
      if (thumb) {
        await conn.sendMessage(m.from, {
          image: { url: thumb },
          caption: `🎵 *${title}*${artist ? `\n🎤 ${artist}` : ''}${duration ? `\n⏱️ ${duration}` : ''}\n\n_Downloading audio..._`,
        }, quoted);
      }
      await conn.sendMessage(m.from, {
        audio: { url: result.url },
        mimetype: 'audio/mpeg',
        fileName: `${title}.mp3`,
        ptt: false,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *YT Audio Failed*\n\n${err.message}\n\nTip: Try sending the direct YouTube URL\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── YOUTUBE MP4 ──────────────────────────────────────────────────────────
  if (['ytmp4', 'ytvideo', 'ytv', 'videodl'].includes(cmd)) {
    if (!q) return m.reply(`📹 *YouTube → MP4*\n\nUsage: ${p}ytmp4 <YouTube URL or video name>\n\n> ${config.BOT_NAME}`);
    await m.React('📹');
    await m.reply(`🔍 *Searching...* _"${q}"_`);
    try {
      let url = q;
      let title = q, duration = '', thumb = '';
      if (!q.includes('youtu')) {
        const vid = await ytSearch(q);
        if (!vid) throw new Error('No YouTube results found');
        url = vid.url;
        title = vid.title;
        duration = vid.timestamp;
        thumb = vid.thumbnail;
      }
      const result = await cobalt(url, 'auto', '720');
      await conn.sendMessage(m.from, {
        video: { url: result.url },
        caption: `📹 *${title}*${duration ? `\n⏱️ ${duration}` : ''}\n\n> ${config.BOT_NAME}`,
        fileName: `${title}.mp4`,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *YT Video Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PLAY (Search + Stream Audio) ─────────────────────────────────────────
  if (['play', 'music', 'song'].includes(cmd)) {
    if (!q) return m.reply(`▶️ *Play Music*\n\nUsage: ${p}play <song name>\n\nExample: ${p}play faded alan walker\n\n> ${config.BOT_NAME}`);
    await m.React('▶️');
    await m.reply(`🔍 *Searching for _"${q}"_...*`);
    try {
      const vid = await ytSearch(q);
      if (!vid) throw new Error('No results found');
      const result = await cobalt(vid.url, 'audio');
      await conn.sendMessage(m.from, {
        image: { url: vid.thumbnail },
        caption: `🎵 *${vid.title}*\n🎤 ${vid.author?.name || 'Unknown'}\n⏱️ ${vid.timestamp}\n👁️ ${vid.views?.toLocaleString?.() || 'N/A'} views\n🔗 ${vid.url}`,
      }, quoted);
      await conn.sendMessage(m.from, {
        audio: { url: result.url },
        mimetype: 'audio/mpeg',
        fileName: `${vid.title}.mp3`,
        ptt: false,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Play Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TIKTOK ───────────────────────────────────────────────────────────────
  if (['tiktok', 'tt', 'ttdl', 'tiktokdl'].includes(cmd)) {
    if (!q || !q.includes('tiktok')) return m.reply(`❌ Usage: ${p}tiktok <TikTok URL>\n\nExample: ${p}tiktok https://www.tiktok.com/@user/video/...\n\n> ${config.BOT_NAME}`);
    await m.React('🎵');
    await m.reply(`⬇️ *Downloading TikTok...*`);
    try {
      const result = await cobalt(q, 'auto');
      await conn.sendMessage(m.from, {
        video: { url: result.url },
        caption: `🎵 *TikTok Downloaded!*\n🔗 ${q}\n\n> ${config.BOT_NAME}`,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *TikTok Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── INSTAGRAM ────────────────────────────────────────────────────────────
  if (['instagram', 'ig', 'igdl', 'insta'].includes(cmd)) {
    if (!q || !q.includes('instagram')) return m.reply(`❌ Usage: ${p}ig <Instagram URL>\n\nExample: ${p}ig https://www.instagram.com/p/.../\n\n> ${config.BOT_NAME}`);
    await m.React('📸');
    await m.reply(`⬇️ *Downloading Instagram...*`);
    try {
      const result = await cobalt(q, 'auto');
      if (result.all && result.all.length > 1) {
        // Multi-media post — send first 4
        for (const item of result.all.slice(0, 4)) {
          const isVideo = item.type === 'video' || item.url?.includes('.mp4');
          await conn.sendMessage(m.from, {
            [isVideo ? 'video' : 'image']: { url: item.url },
            caption: `📸 *Instagram* (${result.all.indexOf(item) + 1}/${Math.min(result.all.length, 4)})\n\n> ${config.BOT_NAME}`,
          }, quoted);
        }
      } else {
        await conn.sendMessage(m.from, {
          video: { url: result.url },
          caption: `📸 *Instagram Downloaded!*\n\n> ${config.BOT_NAME}`,
        }, quoted);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Instagram Failed*\n\n${err.message}\n\nMake sure the post is public!\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── FACEBOOK ─────────────────────────────────────────────────────────────
  if (['facebook', 'fb', 'fbdl', 'fbvideo'].includes(cmd)) {
    if (!q || !(q.includes('facebook') || q.includes('fb.watch'))) return m.reply(`❌ Usage: ${p}fb <Facebook Video URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📘');
    await m.reply(`⬇️ *Downloading Facebook video...*`);
    try {
      const result = await cobalt(q, 'auto');
      await conn.sendMessage(m.from, {
        video: { url: result.url },
        caption: `📘 *Facebook Downloaded!*\n\n> ${config.BOT_NAME}`,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Facebook Failed*\n\n${err.message}\n\nMake sure the video is public!\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TWITTER / X ──────────────────────────────────────────────────────────
  if (['twitter', 'x', 'xdl', 'twitterdl', 'xvideo'].includes(cmd)) {
    if (!q || !(q.includes('twitter') || q.includes('x.com'))) return m.reply(`❌ Usage: ${p}twitter <Twitter/X post URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🐦');
    await m.reply(`⬇️ *Downloading Twitter/X media...*`);
    try {
      const result = await cobalt(q, 'auto');
      await conn.sendMessage(m.from, {
        video: { url: result.url },
        caption: `🐦 *Twitter/X Downloaded!*\n\n> ${config.BOT_NAME}`,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Twitter Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SPOTIFY ──────────────────────────────────────────────────────────────
  // Cobalt doesn't support Spotify — we search YouTube for the same song
  if (['spotify', 'spotifydl', 'sp'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}spotify <Spotify URL or song name>\n\n> ${config.BOT_NAME}`);
    await m.React('🎧');
    await m.reply(`🔍 *Finding track on YouTube...*`);
    try {
      let searchTerm = q;
      // If Spotify URL, extract track name from URL path
      if (q.includes('spotify')) {
        const match = q.match(/track\/([a-zA-Z0-9]+)/);
        if (match) {
          // Use Spotify oEmbed to get title
          try {
            const oembed = await axios.get(`https://open.spotify.com/oembed?url=${q}`, { timeout: 8000 });
            searchTerm = oembed.data?.title || q;
          } catch { searchTerm = 'spotify track'; }
        }
      }
      const vid = await ytSearch(searchTerm);
      if (!vid) throw new Error('No matching track found on YouTube');
      const result = await cobalt(vid.url, 'audio');
      await conn.sendMessage(m.from, {
        audio: { url: result.url },
        mimetype: 'audio/mpeg',
        fileName: `${vid.title}.mp3`,
        ptt: false,
      }, quoted);
      await m.reply(`✅ *Track Downloaded!*\n\n🎵 *Title:* ${vid.title}\n🎤 *Channel:* ${vid.author?.name || 'N/A'}\n⏱️ *Duration:* ${vid.timestamp}\n\n_Source: YouTube (Spotify doesn't allow direct downloads)_\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Spotify Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PINTEREST ────────────────────────────────────────────────────────────
  if (['pinterest', 'pin', 'pinterestdl', 'pinimage'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${p}pinterest <Pinterest URL or search term>\n\nExample: ${p}pin https://pinterest.com/pin/...\n\n> ${config.BOT_NAME}`);
    await m.React('📌');
    try {
      if (q.includes('pinterest') || q.includes('pin.it')) {
        const result = await cobalt(q, 'auto');
        const isVideo = result.url?.includes('.mp4');
        await conn.sendMessage(m.from, {
          [isVideo ? 'video' : 'image']: { url: result.url },
          caption: `📌 *Pinterest Downloaded!*\n\n> ${config.BOT_NAME}`,
        }, quoted);
      } else {
        // Search Pinterest via DuckDuckGo image search
        const searchRes = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent('site:pinterest.com ' + q)}&format=json&t=cloud-ai`, { timeout: 10000 });
        const imageUrl = searchRes.data?.Image || searchRes.data?.Results?.[0]?.Image;
        if (!imageUrl) throw new Error('No Pinterest images found for that search');
        await conn.sendMessage(m.from, {
          image: { url: imageUrl },
          caption: `📌 *Pinterest: ${q}*\n\n> ${config.BOT_NAME}`,
        }, quoted);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Pinterest Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── CAPCUT ───────────────────────────────────────────────────────────────
  if (['capcut', 'capcutdl'].includes(cmd)) {
    if (!q || !q.includes('capcut')) return m.reply(`❌ Usage: ${p}capcut <CapCut share URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🎬');
    await m.reply(`⬇️ *Downloading CapCut video...*`);
    try {
      // Try cobalt first (capcut is supported)
      const result = await cobalt(q, 'auto');
      await conn.sendMessage(m.from, {
        video: { url: result.url },
        caption: `🎬 *CapCut Downloaded!*\n\n> ${config.BOT_NAME}`,
      }, quoted);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *CapCut Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── MEDIAFIRE ────────────────────────────────────────────────────────────
  if (['mediafire', 'mf', 'mfdl'].includes(cmd)) {
    if (!q || !q.includes('mediafire')) return m.reply(`❌ Usage: ${p}mediafire <MediaFire URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📁');
    await m.reply(`⬇️ *Fetching MediaFire download link...*`);
    try {
      const page = await axios.get(q, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = page.data;
      // Extract direct download URL
      const dlMatch = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/);
      const nameMatch = html.match(/<div class="filename"[^>]*>([^<]+)<\/div>/) || html.match(/"filename":"([^"]+)"/);
      const sizeMatch = html.match(/<li class="file-size"[^>]*>([^<]+)<\/li>/) || html.match(/"size":"([^"]+)"/);
      if (!dlMatch) throw new Error('Could not extract download link — MediaFire may require login');
      const dlUrl = dlMatch[1];
      const name = nameMatch?.[1]?.trim() || 'File';
      const size = sizeMatch?.[1]?.trim() || 'Unknown';
      await m.reply(`📁 *MediaFire Download*\n━━━━━━━━━━━━━━━\n\n📄 *File:* ${name}\n📦 *Size:* ${size}\n\n🔗 *Direct Link:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *MediaFire Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── TERABOX ──────────────────────────────────────────────────────────────
  if (['terabox', 'tera', 'teraboxdl'].includes(cmd)) {
    if (!q || !(q.includes('terabox') || q.includes('1024tera'))) return m.reply(`❌ Usage: ${p}terabox <TeraBox URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📦');
    await m.reply(`⬇️ *Fetching TeraBox link...*`);
    try {
      // Use a free TeraBox API endpoint
      const res = await axios.get(`https://terabox.hnn.workers.dev/api?url=${encodeURIComponent(q)}`, { timeout: 20000 });
      const d = res.data;
      const dlUrl = d?.download || d?.url || d?.link || d?.directLink;
      if (!dlUrl) throw new Error('Could not extract TeraBox download link');
      await m.reply(`📦 *TeraBox Download*\n━━━━━━━━━━━━━━━\n\n📄 *File:* ${d?.filename || d?.name || 'File'}\n\n🔗 *Link:*\n${dlUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *TeraBox Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── GOOGLE DRIVE ─────────────────────────────────────────────────────────
  if (['gdrive', 'googledrive', 'gdrivedownload'].includes(cmd)) {
    if (!q || !(q.includes('drive.google') || q.includes('docs.google'))) return m.reply(`❌ Usage: ${p}gdrive <Google Drive URL>\n\n> ${config.BOT_NAME}`);
    await m.React('☁️');
    try {
      // Extract file ID and construct direct download URL
      const idMatch = q.match(/\/d\/([a-zA-Z0-9_-]+)/) || q.match(/id=([a-zA-Z0-9_-]+)/);
      if (!idMatch) throw new Error('Could not extract Google Drive file ID from URL');
      const fileId = idMatch[1];
      const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
      await m.reply(`☁️ *Google Drive Download*\n━━━━━━━━━━━━━━━\n\n🆔 *File ID:* \`${fileId}\`\n\n🔗 *Direct Download Link:*\n${dlUrl}\n\n🔍 *Preview:*\n${previewUrl}\n\n⚠️ _Note: File must be publicly shared_\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Google Drive Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── AIO (Auto Detect & Download) ─────────────────────────────────────────
  if (['aio', 'auto', 'autodownload'].includes(cmd)) {
    if (!q || !q.startsWith('http')) return m.reply(`❌ Usage: ${p}aio <URL>\n\n*Supported:* YouTube, TikTok, Instagram, Twitter/X, Facebook, Pinterest, Reddit, SoundCloud, Vimeo, and more!\n\n> ${config.BOT_NAME}`);
    await m.React('⬇️');
    await m.reply(`🔍 *Auto-detecting platform and downloading...*`);
    try {
      const result = await cobalt(q, 'auto');
      // Detect audio vs video by URL
      const url = result.url;
      const isAudio = url?.includes('.mp3') || url?.includes('audio') || url?.includes('.opus') || url?.includes('.m4a');
      if (isAudio) {
        await conn.sendMessage(m.from, {
          audio: { url },
          mimetype: 'audio/mpeg',
          ptt: false,
        }, quoted);
      } else {
        await conn.sendMessage(m.from, {
          video: { url },
          caption: `⬇️ *Downloaded!*\n🔗 ${q}\n\n> ${config.BOT_NAME}`,
        }, quoted);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *Auto Download Failed*\n\n${err.message}\n\nTry a specific command: ${p}ytmp3, ${p}tiktok, ${p}ig, etc.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── GITHUB CLONE ─────────────────────────────────────────────────────────
  if (['gitclone', 'gh-clone', 'githubclone'].includes(cmd)) {
    if (!q || !q.includes('github')) return m.reply(`❌ Usage: ${p}gitclone <GitHub Repo URL>\n\nExample: ${p}gitclone https://github.com/user/repo\n\n> ${config.BOT_NAME}`);
    await m.React('💻');
    try {
      // Clean up URL and construct ZIP download link
      const cleanUrl = q.replace(/\.git$/, '').replace(/\/$/, '');
      const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/?\s#]+)/);
      if (!match) throw new Error('Invalid GitHub URL format');
      const [, owner, repo] = match;
      // Try to get default branch from GitHub API (public, no auth needed)
      let branch = 'main';
      try {
        const apiRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
          timeout: 8000,
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        branch = apiRes.data?.default_branch || 'main';
      } catch { branch = 'main'; }

      const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
      const repoUrl = `https://github.com/${owner}/${repo}`;
      await m.reply(`💻 *GitHub Repository*\n━━━━━━━━━━━━━━━\n\n📦 *Repo:* ${owner}/${repo}\n🌿 *Branch:* ${branch}\n🔗 *Repo:* ${repoUrl}\n\n📥 *Download ZIP:*\n${zipUrl}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ *GitHub Clone Failed*\n\n${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default downloader;
