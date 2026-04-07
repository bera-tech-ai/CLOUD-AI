import config from '../config.cjs';
import axios from 'axios';
import crypto from 'crypto';
import { sendBtn } from '../lib/sendBtn.js';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

async function gApi(path, params = {}) {
  const res = await axios.get(`${API}/${path}`, { params: { apikey: KEY, ...params }, timeout: 25000 });
  return res.data;
}

const extra = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── STALK ───
  if (['stalk', 'whois', 'info'].includes(cmd)) {
    const target = q ? q.replace(/\D/g, '') : m.mentionedJid?.[0]?.split('@')[0];
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}stalk <number or @mention>\n\nExample: ${config.PREFIX}stalk 254700000000`);
    await m.React('🔍');
    const jid = `${target}@s.whatsapp.net`;
    try {
      let pp = config.MENU_IMAGE;
      try { pp = await conn.profilePictureUrl(jid, 'image'); } catch {}
      const [status] = await conn.fetchStatus(jid).catch(() => [{ status: 'N/A', setAt: null }]);
      const name = await conn.getBusinessProfile(jid).catch(() => null);
      await conn.sendMessage(m.from, {
        image: { url: pp },
        caption: `🔍 *WhatsApp Stalk*\n\n📱 *Number:* +${target}\n📛 *Status:* ${status?.status || 'No status'}\n🕒 *Status Set:* ${status?.setAt ? new Date(status.setAt * 1000).toLocaleDateString() : 'N/A'}\n🏢 *Business:* ${name?.description ? '✅ Yes' : '❌ No'}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Stalk failed: ${err.message}\n\n_Make sure the number is on WhatsApp_`);
    }
    return;
  }

  // ─── GET PROFILE PIC ───
  if (['pp', 'pfp', 'getpp', 'profilepic', 'avatar'].includes(cmd)) {
    const target = q ? `${q.replace(/\D/g, '')}@s.whatsapp.net` : m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}pp @mention or <number>`);
    await m.React('🖼️');
    try {
      const url = await conn.profilePictureUrl(target, 'image');
      await conn.sendMessage(m.from, {
        image: { url },
        caption: `🖼️ *Profile Picture*\n👤 *User:* @${target.split('@')[0]}\n\n> ${config.BOT_NAME}`,
        mentions: [target],
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ No profile picture found or private account`);
    }
    return;
  }

  // ─── GET BIO ───
  if (['getbio', 'readbio', 'getstatus'].includes(cmd)) {
    const target = q ? `${q.replace(/\D/g, '')}@s.whatsapp.net` : m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}getbio @mention or <number>`);
    await m.React('📄');
    try {
      const [status] = await conn.fetchStatus(target);
      await m.reply(`📄 *WhatsApp Bio*\n\n👤 *User:* @${target.split('@')[0]}\n📝 *Status:* ${status?.status || 'No status set'}\n\n> ${config.BOT_NAME}`, { mentions: [target] });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Could not fetch bio: ${err.message}`);
    }
    return;
  }

  // ─── CARBON (code to image) ───
  if (['carbon', 'carbon-code', 'code2img', 'codeimage'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}carbon <code>\n\nExample: ${config.PREFIX}carbon console.log("Hello World")`);
    await m.React('💻');
    try {
      const res = await axios.get(`https://carbonara.solopov.dev/api/cook`, {
        params: {
          code: q,
          theme: 'dracula',
          backgroundColor: '#1a1a2e',
          language: 'auto',
          fontFamily: 'JetBrains Mono',
          fontSize: '14px',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const buffer = Buffer.from(res.data);
      await conn.sendMessage(m.from, {
        image: buffer,
        caption: `💻 *Code → Image*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch {
      // Fallback to ray.so API
      try {
        const encoded = encodeURIComponent(q);
        const url = `https://api.ray.so/?title=Code&theme=candy&background=true&darkMode=true&padding=32&language=auto&code=${encoded}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await conn.sendMessage(m.from, {
          image: Buffer.from(res.data),
          caption: `💻 *Code → Image*\n\n> ${config.BOT_NAME}`,
        }, { quoted: { key: m.key, message: m.message } });
        await m.React('✅');
      } catch (err2) {
        await m.React('❌');
        await m.reply(`❌ Carbon failed: ${err2.message}`);
      }
    }
    return;
  }

  // ─── PASSWORD GENERATOR ───
  if (['password', 'genpassword', 'passgen', 'genpass'].includes(cmd)) {
    await m.React('🔐');
    const length = Math.min(Math.max(parseInt(q) || 16, 8), 64);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let pass = '';
    for (let i = 0; i < length; i++) {
      pass += chars[Math.floor(Math.random() * chars.length)];
    }
    await m.reply(`🔐 *Generated Password*\n\n\`\`\`${pass}\`\`\`\n\n📏 *Length:* ${length} characters\n\n⚠️ _Store this safely! Delete this message after saving._\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── BASE64 ───
  if (['base64', 'b64'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}base64 <encode:text> or <decode:base64text>`);
    await m.React('🔢');
    try {
      if (q.startsWith('decode:') || q.startsWith('d:')) {
        const input = q.replace(/^(decode:|d:)/, '');
        const decoded = Buffer.from(input, 'base64').toString('utf8');
        await m.reply(`🔢 *Base64 Decoded:*\n\n\`\`\`${decoded}\`\`\`\n\n> ${config.BOT_NAME}`);
      } else {
        const input = q.replace(/^(encode:|e:)/, '');
        const encoded = Buffer.from(input).toString('base64');
        await m.reply(`🔢 *Base64 Encoded:*\n\n\`\`\`${encoded}\`\`\`\n\n> ${config.BOT_NAME}`);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Base64 failed: ${err.message}`);
    }
    return;
  }

  // ─── BINARY ───
  if (['binary', 'bin'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}binary <text>`);
    await m.React('🔢');
    const result = q.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    await m.reply(`🔢 *Text → Binary*\n\n*Input:* ${q}\n*Output:*\n\`\`\`${result}\`\`\`\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── HEX ───
  if (['hex'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}hex <text>`);
    await m.React('🔢');
    const result = Buffer.from(q).toString('hex').match(/.{2}/g).join(' ');
    await m.reply(`🔢 *Text → Hex*\n\n*Input:* ${q}\n*Output:*\n\`\`\`${result}\`\`\`\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── MORSE ───
  if (['morse', 'morsecode'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}morse <text>`);
    await m.React('📡');
    const morseMap = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.' };
    const result = q.toUpperCase().split('').map(c => morseMap[c] || (c === ' ' ? '/' : c)).join(' ');
    await m.reply(`📡 *Text → Morse Code*\n\n*Input:* ${q}\n*Output:*\n\`\`\`${result}\`\`\`\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── REVERSE ───
  if (['reverse', 'rev', 'esrever'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}reverse <text>`);
    await m.React('🔄');
    await m.reply(`🔄 *Reversed Text:*\n\n${q.split('').reverse().join('')}\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── TIME ───
  if (['time', 'clock', 'timezone'].includes(cmd)) {
    await m.React('🕒');
    try {
      let tz = 'Africa/Nairobi';
      const tzMap = {
        nairobi: 'Africa/Nairobi', kenya: 'Africa/Nairobi', kenia: 'Africa/Nairobi',
        london: 'Europe/London', uk: 'Europe/London', england: 'Europe/London',
        new_york: 'America/New_York', nyc: 'America/New_York', usa: 'America/New_York',
        dubai: 'Asia/Dubai', uae: 'Asia/Dubai',
        tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo',
        berlin: 'Europe/Berlin', germany: 'Europe/Berlin',
        paris: 'Europe/Paris', france: 'Europe/Paris',
        mumbai: 'Asia/Kolkata', india: 'Asia/Kolkata',
        beijing: 'Asia/Shanghai', china: 'Asia/Shanghai',
        sydney: 'Australia/Sydney', australia: 'Australia/Sydney',
        lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos',
        johannesburg: 'Africa/Johannesburg', 'south africa': 'Africa/Johannesburg',
      };
      if (q) tz = tzMap[q.toLowerCase().replace(/\s+/g, '_')] || 'Africa/Nairobi';
      const { default: moment } = await import('moment-timezone');
      const t = moment().tz(tz);
      await m.reply(`🕒 *World Time*\n\n🌍 *Location:* ${q || 'Nairobi'}\n⏰ *Time:* ${t.format('HH:mm:ss')}\n📅 *Date:* ${t.format('dddd, DD MMMM YYYY')}\n🌐 *Timezone:* ${tz}\n📍 *UTC Offset:* ${t.format('Z')}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Time failed: ${err.message}`);
    }
    return;
  }

  // ─── RINGTONE SEARCH ───
  if (['ringtone', 'ringtonesearch'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ringtone <song name>`);
    await m.React('🎵');
    try {
      const data = await gApi('search/ringtone', { q });
      const r = data?.result || data;
      if (!r) throw new Error('No ringtone found');
      const url = r?.download || r?.url || r?.audio;
      if (!url) throw new Error('No download URL');
      await conn.sendMessage(m.from, {
        audio: { url },
        mimetype: 'audio/mpeg',
        fileName: `${q}.mp3`,
        ptt: false,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Ringtone not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── ANIME SEARCH ───
  if (['anime', 'animesearch', 'animefind'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}anime <anime name>`);
    await m.React('🎌');
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=1`, { timeout: 15000 });
      const anime = res.data?.data?.[0];
      if (!anime) throw new Error('Anime not found');
      const img = anime.images?.jpg?.image_url;
      const msg = `🎌 *Anime Info*\n\n📺 *Title:* ${anime.title}\n🇯🇵 *Japanese:* ${anime.title_japanese || 'N/A'}\n⭐ *Score:* ${anime.score || 'N/A'}/10\n📊 *Rank:* #${anime.rank || 'N/A'}\n🎭 *Type:* ${anime.type || 'N/A'}\n📡 *Status:* ${anime.status || 'N/A'}\n📅 *Episodes:* ${anime.episodes || '?'}\n🎬 *Studio:* ${anime.studios?.[0]?.name || 'N/A'}\n📝 *Synopsis:* ${(anime.synopsis || '').slice(0, 300)}...\n\n🔗 ${anime.url || ''}\n\n> ${config.BOT_NAME}`;
      if (img) {
        await conn.sendMessage(m.from, { image: { url: img }, caption: msg }, { quoted: { key: m.key, message: m.message } });
      } else {
        await m.reply(msg);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Anime search failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── MANGA SEARCH ───
  if (['manga', 'mangasearch'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}manga <manga name>`);
    await m.React('📚');
    try {
      const res = await axios.get(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(q)}&limit=1`, { timeout: 15000 });
      const manga = res.data?.data?.[0];
      if (!manga) throw new Error('Manga not found');
      const img = manga.images?.jpg?.image_url;
      const msg = `📚 *Manga Info*\n\n📖 *Title:* ${manga.title}\n🇯🇵 *Japanese:* ${manga.title_japanese || 'N/A'}\n⭐ *Score:* ${manga.score || 'N/A'}/10\n📊 *Rank:* #${manga.rank || 'N/A'}\n📅 *Chapters:* ${manga.chapters || '?'}\n📡 *Status:* ${manga.status || 'N/A'}\n📝 *Synopsis:* ${(manga.synopsis || '').slice(0, 300)}...\n\n> ${config.BOT_NAME}`;
      if (img) {
        await conn.sendMessage(m.from, { image: { url: img }, caption: msg }, { quoted: { key: m.key, message: m.message } });
      } else {
        await m.reply(msg);
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Manga not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }
};

export default extra;
