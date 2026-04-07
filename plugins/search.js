import config from '../config.cjs';
import axios from 'axios';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

async function gApi(path, params = {}) {
  const res = await axios.get(`${API}/${path}`, { params: { apikey: KEY, ...params }, timeout: 30000 });
  return res.data;
}

const search = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── GOOGLE ───
  if (['google', 'search', 'gsearch'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}google <query>`);
    await m.React('🔍');
    try {
      const data = await gApi('search/google', { q });
      const results = data?.result || data?.results || [];
      if (!results.length) throw new Error('No results found');
      let text = `🔍 *Google Search: "${q}"*\n\n`;
      results.slice(0, 5).forEach((r, i) => {
        text += `*${i + 1}.* ${r.title || 'No title'}\n`;
        text += `📎 ${r.url || r.link || 'No URL'}\n`;
        text += `📝 ${(r.description || r.snippet || '').slice(0, 100)}...\n\n`;
      });
      text += `> ${config.BOT_NAME}`;
      await m.reply(text);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Search failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── YOUTUBE SEARCH ───
  if (['youtube', 'yt', 'ytsearch', 'yts'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}youtube <query>`);
    await m.React('🎬');
    try {
      const data = await gApi('search/ytsearch', { q });
      const results = data?.result || data?.results || [];
      if (!results.length) throw new Error('No results found');
      let text = `🎬 *YouTube Search: "${q}"*\n\n`;
      results.slice(0, 5).forEach((r, i) => {
        text += `*${i + 1}.* ${r.title || 'Unknown'}\n`;
        text += `⏱️ ${r.duration || 'N/A'} | 👁️ ${r.views || 'N/A'}\n`;
        text += `🔗 ${r.url || ''}\n\n`;
      });
      text += `> Use ${config.PREFIX}ytmp3 or ${config.PREFIX}ytmp4 to download\n> ${config.BOT_NAME}`;
      await m.reply(text);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ YouTube search failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── WIKIPEDIA ───
  if (['wikipedia', 'wiki', 'wp'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}wikipedia <topic>`);
    await m.React('📚');
    try {
      const data = await gApi('search/wikipedia', { q });
      const r = data?.result || data;
      const text = r?.description || r?.extract || r?.summary;
      if (!text) throw new Error('No Wikipedia entry found');
      const title = r?.title || q;
      const msg = `📚 *Wikipedia: ${title}*\n\n${text.slice(0, 2000)}${text.length > 2000 ? '...\n\n_(Read more on Wikipedia)_' : ''}\n\n> ${config.BOT_NAME}`;
      await m.reply(msg);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Wikipedia search failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── DICTIONARY ───
  if (['define', 'dict', 'dictionary', 'meaning', 'definition'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}define <word>`);
    await m.React('📖');
    try {
      const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q.split(' ')[0])}`, { timeout: 10000 });
      const entry = res.data?.[0];
      if (!entry) throw new Error('Word not found');
      const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
      let text = `📖 *${entry.word}* ${phonetic}\n\n`;
      entry.meanings?.slice(0, 3).forEach(meaning => {
        text += `*${meaning.partOfSpeech}*\n`;
        meaning.definitions?.slice(0, 2).forEach((def, i) => {
          text += `${i + 1}. ${def.definition}\n`;
          if (def.example) text += `_Example: "${def.example}"_\n`;
        });
        text += '\n';
      });
      text += `> ${config.BOT_NAME}`;
      await m.reply(text);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Definition not found for "${q}": ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── GITHUB ───
  if (['github', 'ghuser', 'gituser'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}github <username>`);
    await m.React('💻');
    try {
      const res = await axios.get(`https://api.github.com/users/${q}`, { timeout: 10000 });
      const u = res.data;
      await conn.sendMessage(m.from, {
        image: { url: u.avatar_url },
        caption: `💻 *GitHub Profile*\n\n👤 *Name:* ${u.name || 'N/A'}\n🔗 *Username:* @${u.login}\n📝 *Bio:* ${u.bio || 'No bio'}\n📍 *Location:* ${u.location || 'N/A'}\n🌐 *Website:* ${u.blog || 'N/A'}\n⭐ *Repos:* ${u.public_repos}\n👥 *Followers:* ${u.followers}\n👤 *Following:* ${u.following}\n📅 *Joined:* ${new Date(u.created_at).toLocaleDateString()}\n\n🔗 ${u.html_url}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ GitHub profile not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── NPM ───
  if (['npm', 'npmpackage', 'package'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}npm <package name>`);
    await m.React('📦');
    try {
      const res = await axios.get(`https://registry.npmjs.org/${q}`, { timeout: 10000 });
      const p = res.data;
      const latest = p['dist-tags']?.latest || 'N/A';
      const info = p.versions?.[latest] || {};
      await m.reply(`📦 *NPM Package: ${p.name}*\n\n📄 *Description:* ${p.description || 'N/A'}\n🏷️ *Latest Version:* ${latest}\n👤 *Author:* ${info.author?.name || p.author?.name || 'N/A'}\n📜 *License:* ${info.license || 'N/A'}\n📥 *Downloads:* Check npm\n🔗 ${p.homepage || `https://www.npmjs.com/package/${p.name}`}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Package not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── MOVIE ───
  if (['movie', 'film', 'imdb', 'movieinfo'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}movie <movie name>`);
    await m.React('🎬');
    try {
      const data = await gApi('search/movie', { q });
      const r = data?.result || data;
      if (!r) throw new Error('Movie not found');
      const msg = `🎬 *${r.title || q}*\n\n📅 *Year:* ${r.year || 'N/A'}\n⭐ *Rating:* ${r.rating || r.imdbRating || 'N/A'}\n🎭 *Genre:* ${r.genre || 'N/A'}\n🎬 *Director:* ${r.director || 'N/A'}\n🎤 *Cast:* ${r.cast || r.actors || 'N/A'}\n⏱️ *Duration:* ${r.runtime || 'N/A'}\n📝 *Plot:* ${(r.plot || r.description || '').slice(0, 300)}...\n\n> ${config.BOT_NAME}`;
      await m.reply(msg);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Movie not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }
};

export default search;
