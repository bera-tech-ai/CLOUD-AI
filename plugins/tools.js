import config from '../config.cjs';
import axios from 'axios';
import crypto from 'crypto';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

async function gApi(path, params = {}) {
  const res = await axios.get(`${API}/${path}`, { params: { apikey: KEY, ...params }, timeout: 30000 });
  return res.data;
}

const tools = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── WEATHER ───
  if (['weather', 'climate', 'forecast'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}weather <city name>`);
    await m.React('⛅');
    try {
      const data = await gApi('tools/weather', { q });
      const r = data?.result || data;
      await m.reply(`⛅ *Weather: ${r?.location || q}*\n\n🌡️ *Temperature:* ${r?.temperature || r?.temp || 'N/A'}\n🤔 *Feels Like:* ${r?.feels_like || 'N/A'}\n☁️ *Condition:* ${r?.condition || r?.description || 'N/A'}\n💧 *Humidity:* ${r?.humidity || 'N/A'}\n🌬️ *Wind:* ${r?.wind || 'N/A'}\n👁️ *Visibility:* ${r?.visibility || 'N/A'}\n🌅 *Sunrise:* ${r?.sunrise || 'N/A'}\n🌇 *Sunset:* ${r?.sunset || 'N/A'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Weather failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── LYRICS ───
  if (['lyrics', 'lyric', 'songlyrics'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}lyrics <song name>`);
    await m.React('🎵');
    try {
      const data = await gApi('tools/lyrics', { q });
      const r = data?.result || data;
      const text = r?.lyrics || r?.result;
      if (!text) throw new Error('Lyrics not found');
      const msg = `🎵 *${r?.title || q}*\n🎤 *${r?.artist || 'Unknown'}*\n\n${text.slice(0, 3000)}${text.length > 3000 ? '...\n\n_(Lyrics truncated)_' : ''}`;
      await m.reply(msg);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Lyrics not found: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── QR CODE ───
  if (['qr', 'qrcode', 'qrgen'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}qr <text or URL>`);
    await m.React('📲');
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(q)}`;
      await conn.sendMessage(m.from, {
        image: { url: qrUrl },
        caption: `📲 *QR Code Generated*\n\n📝 *Content:* ${q}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ QR generation failed: ${err.message}`);
    }
    return;
  }

  // ─── SCREENSHOT ───
  if (['screenshot', 'ss', 'webss', 'capture'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}screenshot <URL>`);
    await m.React('📸');
    try {
      const data = await gApi('tools/screenshot', { url: q });
      const imgUrl = data?.result?.screenshot || data?.screenshot || data?.result?.image || data?.image;
      if (!imgUrl) throw new Error('No screenshot returned');
      await conn.sendMessage(m.from, {
        image: { url: imgUrl },
        caption: `📸 *Screenshot*\n🔗 *URL:* ${q}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Screenshot failed: ${err?.response?.data?.message || err.message}`);
    }
    return;
  }

  // ─── REMOVE BACKGROUND ───
  if (['removebg', 'rmbg', 'nobg', 'bgremove'].includes(cmd)) {
    const quotedImg = m.quoted?.message?.imageMessage || m.message?.imageMessage;
    if (!quotedImg) return m.reply(`❌ Please send or quote an image with ${config.PREFIX}removebg`);
    await m.React('✨');
    try {
      const buffer = await downloadMediaMessage(
        m.quoted?.message ? { message: m.quoted.message, key: m.quoted.key } : m, 'buffer', {}
      );
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('image_file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      const res = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
        headers: { ...form.getHeaders(), 'X-Api-Key': 'REMOVE_BG_API' },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      await conn.sendMessage(m.from, {
        image: Buffer.from(res.data),
        caption: `✨ *Background Removed!*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch {
      // Fallback to API
      try {
        const data = await gApi('tools/removebg', { url: 'placeholder' });
        const imgUrl = data?.result?.image || data?.image;
        if (!imgUrl) throw new Error('No result');
        await conn.sendMessage(m.from, { image: { url: imgUrl }, caption: `✨ Background Removed!\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
        await m.React('✅');
      } catch (err2) {
        await m.React('❌');
        await m.reply(`❌ Remove BG failed: ${err2.message}`);
      }
    }
    return;
  }

  // ─── QUOTE ───
  if (['quote', 'inspiration', 'motivate', 'inspire'].includes(cmd)) {
    await m.React('💭');
    try {
      const data = await gApi('general/quote');
      const r = data?.result || data;
      const text = r?.quote || r?.text || r?.content;
      const author = r?.author || 'Unknown';
      if (!text) throw new Error('No quote');
      await m.reply(`💭 *Quote of the Moment*\n\n_"${text}"_\n\n— *${author}*\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      const quotes = [
        'The only way to do great work is to love what you do. — Steve Jobs',
        'It is during our darkest moments that we must focus to see the light. — Aristotle',
        'The best time to plant a tree was 20 years ago. The second best time is now. — Chinese Proverb',
        'An unexamined life is not worth living. — Socrates',
      ];
      await m.reply(`💭 *Quote*\n\n_"${quotes[Math.floor(Math.random() * quotes.length)]}"_\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SHORTEN URL ───
  if (['shortlink', 'shorten', 'tinyurl', 'shorturl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}shortlink <URL>`);
    await m.React('🔗');
    try {
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(q)}`, { timeout: 10000 });
      await m.reply(`🔗 *URL Shortened!*\n\n📎 *Original:* ${q}\n✂️ *Short:* ${res.data}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ URL shortening failed: ${err.message}`);
    }
    return;
  }

  // ─── TTS ───
  if (['tts', 'speak', 'voice'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}tts <text>`);
    await m.React('🔊');
    try {
      const lang = 'en';
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(q)}&tl=${lang}&client=tw-ob`;
      await conn.sendMessage(m.from, {
        audio: { url: ttsUrl },
        mimetype: 'audio/mpeg',
        ptt: true,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ TTS failed: ${err.message}`);
    }
    return;
  }

  // ─── ENCRYPT ───
  if (['encrypt', 'enc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}encrypt <text>`);
    await m.React('🔐');
    try {
      const key = crypto.createHash('sha256').update(config.BOT_NAME).digest('hex').slice(0, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
      const encrypted = Buffer.concat([cipher.update(q), cipher.final()]);
      const result = iv.toString('hex') + ':' + encrypted.toString('hex');
      await m.reply(`🔐 *Encrypted Text*\n\n\`\`\`${result}\`\`\`\n\n> Use ${config.PREFIX}decrypt to decode\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Encryption failed: ${err.message}`);
    }
    return;
  }

  // ─── DECRYPT ───
  if (['decrypt', 'dec'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}decrypt <encrypted text>`);
    await m.React('🔓');
    try {
      const key = crypto.createHash('sha256').update(config.BOT_NAME).digest('hex').slice(0, 32);
      const [ivHex, encHex] = q.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
      const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
      await m.reply(`🔓 *Decrypted Text*\n\n\`\`\`${decrypted.toString()}\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Decryption failed: Make sure you used ${config.PREFIX}encrypt to create this text`);
    }
    return;
  }

  // ─── TRANSLATE URL ───
  if (['tourl', 'mediaurl', 'uploadmedia'].includes(cmd)) {
    const quotedMedia = m.quoted?.message?.imageMessage || m.quoted?.message?.videoMessage || m.quoted?.message?.audioMessage;
    if (!quotedMedia) return m.reply(`❌ Quote an image, video or audio with ${config.PREFIX}tourl`);
    await m.React('🔗');
    try {
      const buffer = await downloadMediaMessage({ message: m.quoted.message, key: m.quoted.key }, 'buffer', {});
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', buffer, { filename: `media_${Date.now()}`, contentType: 'image/jpeg' });
      const res = await axios.post('https://catbox.moe/user/api.php?userhash=&reqtype=fileupload', form, {
        headers: form.getHeaders(), timeout: 30000
      });
      await m.reply(`🔗 *Media URL:*\n\n${res.data}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Upload failed: ${err.message}`);
    }
    return;
  }

  // ─── STALK ───
  if (['stalk', 'whois', 'getinfo'].includes(cmd)) {
    const target = q ? q.replace(/\D/g, '') + '@s.whatsapp.net' : (m.quoted?.sender || null);
    if (!target) return m.reply(`❌ Usage: ${config.PREFIX}stalk <phone number with country code>\n*Example:* ${config.PREFIX}stalk 254712345678`);
    await m.React('🔍');
    try {
      let pp = config.MENU_IMAGE;
      try { pp = await conn.profilePictureUrl(target, 'image'); } catch {}
      let bio = { status: 'No bio available' };
      try { bio = await conn.fetchStatus(target); } catch {}
      const num = target.split('@')[0];
      await conn.sendMessage(m.from, {
        image: { url: pp },
        caption: `🔍 *User Profile*\n\n📱 *Number:* +${num}\n💬 *Bio:* ${bio?.status || 'Hidden'}\n🖼️ *Profile Pic:* ${pp !== config.MENU_IMAGE ? 'Available' : 'Hidden'}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Stalk failed: ${err.message}`);
    }
    return;
  }

  // ─── PP ───
  if (['pp', 'profilepic', 'pfp', 'getpp'].includes(cmd)) {
    const target = q ? q.replace(/\D/g, '') + '@s.whatsapp.net' : m.sender;
    await m.React('🖼️');
    try {
      const pp = await conn.profilePictureUrl(target, 'image');
      await conn.sendMessage(m.from, {
        image: { url: pp },
        caption: `🖼️ *Profile Picture*\n📱 +${target.split('@')[0]}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply('❌ Profile picture not found or hidden.');
    }
    return;
  }

  // ─── BINARY ENCODE ───
  if (['ebinary', 'tobinary', 'binenc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ebinary <text>\n\n> ${config.BOT_NAME}`);
    await m.React('🔢');
    const binary = q.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    await m.reply(`🔢 *Binary Encoded*\n\n\`\`\`${binary}\`\`\`\n\n> Use ${config.PREFIX}debinary to decode\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── BINARY DECODE ───
  if (['debinary', 'frombinary', 'bindec'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}debinary <binary>\n\n> ${config.BOT_NAME}`);
    await m.React('🔡');
    try {
      const text = q.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
      await m.reply(`🔡 *Binary Decoded*\n\n\`\`\`${text}\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ Invalid binary input.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── BASE64 ENCODE ───
  if (['ebase64', 'tobase64', 'b64enc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ebase64 <text>\n\n> ${config.BOT_NAME}`);
    await m.React('🔐');
    const encoded = Buffer.from(q).toString('base64');
    await m.reply(`🔐 *Base64 Encoded*\n\n\`\`\`${encoded}\`\`\`\n\n> Use ${config.PREFIX}dbase64 to decode\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── BASE64 DECODE ───
  if (['dbase64', 'frombase64', 'b64dec'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}dbase64 <base64>\n\n> ${config.BOT_NAME}`);
    await m.React('🔓');
    try {
      const decoded = Buffer.from(q, 'base64').toString('utf-8');
      await m.reply(`🔓 *Base64 Decoded*\n\n\`\`\`${decoded}\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ Invalid Base64 input.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── HEX ENCODE ───
  if (['ehex', 'tohex', 'hexenc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ehex <text>\n\n> ${config.BOT_NAME}`);
    await m.React('🔢');
    const hex = Buffer.from(q).toString('hex');
    await m.reply(`🔢 *Hex Encoded*\n\n\`\`\`${hex}\`\`\`\n\n> Use ${config.PREFIX}dhex to decode\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── HEX DECODE ───
  if (['dhex', 'fromhex', 'hexdec'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}dhex <hex>\n\n> ${config.BOT_NAME}`);
    await m.React('🔓');
    try {
      const decoded = Buffer.from(q.replace(/\s+/g, ''), 'hex').toString('utf-8');
      await m.reply(`🔓 *Hex Decoded*\n\n\`\`\`${decoded}\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch {
      await m.React('❌');
      await m.reply(`❌ Invalid hex input.\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── MORSE ENCODE ───
  if (['emorse', 'tomorse', 'morseenc'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}emorse <text>\n\n> ${config.BOT_NAME}`);
    await m.React('📡');
    const MORSE = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.' };
    const encoded = q.toUpperCase().split('').map(c => c === ' ' ? '/' : (MORSE[c] || '?')).join(' ');
    await m.reply(`📡 *Morse Code*\n\n\`\`\`${encoded}\`\`\`\n\n> Use ${config.PREFIX}dmorse to decode\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── MORSE DECODE ───
  if (['dmorse', 'frommorse', 'morsedec'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}dmorse <morse code>\n\n> ${config.BOT_NAME}`);
    await m.React('📡');
    const MORSE_REV = {  '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9' };
    const decoded = q.split(' / ').map(word => word.split(' ').map(c => MORSE_REV[c] || '?').join('')).join(' ');
    await m.reply(`📡 *Morse Decoded*\n\n\`\`\`${decoded}\`\`\`\n\n> ${config.BOT_NAME}`);
    await m.React('✅');
    return;
  }

  // ─── FETCH URL ───
  if (['fetch', 'geturl', 'curl'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}fetch <URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🌐');
    try {
      let url = q.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, validateStatus: () => true });
      const ct = res.headers['content-type'] || 'text/plain';
      const buf = Buffer.from(res.data);
      if (ct.includes('image/')) {
        return conn.sendMessage(m.from, { image: buf, caption: `🌐 *${url}*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      }
      if (ct.includes('video/')) {
        return conn.sendMessage(m.from, { video: buf, caption: `🌐 *${url}*\n\n> ${config.BOT_NAME}` }, { quoted: { key: m.key, message: m.message } });
      }
      if (ct.includes('json')) {
        try {
          const json = JSON.parse(buf.toString('utf8'));
          return m.reply('```json\n' + JSON.stringify(json, null, 2).slice(0, 3500) + '\n```');
        } catch {}
      }
      const text = buf.toString('utf8').slice(0, 3000);
      await m.reply(`🌐 *Response from:* ${url}\n\n\`\`\`\n${text}\n\`\`\`\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Fetch failed: ${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SCREENSHOT (mobile view) ───
  if (['ssphone', 'ssmobile', 'phoness'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}ssphone <URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📱');
    try {
      const ssUrl = `https://s.pagepeeker.com/v2/thumbs.php?size=x&url=${encodeURIComponent(q)}&apikey=free`;
      const alt = `https://api.apiflash.com/v1/urltoimage?access_key=free&url=${encodeURIComponent(q)}&width=390&height=844`;
      const imgUrl = `https://screenshot.guru/screenshot/${encodeURIComponent(q)}/390/844`;
      const data = await gApi('tools/ssphone', { url: q }).catch(() => null);
      const img = data?.result?.image || data?.image || imgUrl;
      await conn.sendMessage(m.from, {
        image: { url: img },
        caption: `📱 *Mobile Screenshot*\n🌐 ${q}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Screenshot failed: ${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SCREENSHOT (tablet view) ───
  if (['sstab', 'sstablet', 'tabletss'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}sstab <URL>\n\n> ${config.BOT_NAME}`);
    await m.React('📱');
    try {
      const data = await gApi('tools/sstab', { url: q }).catch(() => null);
      const img = data?.result?.image || data?.image || `https://screenshot.guru/screenshot/${encodeURIComponent(q)}/768/1024`;
      await conn.sendMessage(m.from, {
        image: { url: img },
        caption: `📱 *Tablet Screenshot*\n🌐 ${q}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Screenshot failed: ${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── SCREENSHOT (desktop view) ───
  if (['sspc', 'ssweb', 'pcss', 'desktopss'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}sspc <URL>\n\n> ${config.BOT_NAME}`);
    await m.React('🖥️');
    try {
      const data = await gApi('tools/sspc', { url: q }).catch(() => null);
      const img = data?.result?.image || data?.image || `https://screenshot.guru/screenshot/${encodeURIComponent(q)}/1280/800`;
      await conn.sendMessage(m.from, {
        image: { url: img },
        caption: `🖥️ *Desktop Screenshot*\n🌐 ${q}\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Screenshot failed: ${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── DOMAIN INFO ───
  if (['domain', 'whois', 'domaincheck'].includes(cmd)) {
    if (!q) return m.reply(`❌ Usage: ${config.PREFIX}domain <domain.com>\n\n> ${config.BOT_NAME}`);
    await m.React('🌐');
    try {
      const res = await axios.get(`https://api.domainsdb.info/v1/domains/search?domain=${q}&limit=1`, { timeout: 10000 });
      const info = res.data?.domains?.[0];
      if (!info) throw new Error('Domain not found');
      await m.reply(`🌐 *Domain Info*\n\n🔖 *Domain:* ${info.domain}\n📅 *Created:* ${info.create_date?.split('T')[0] || 'N/A'}\n📅 *Updated:* ${info.update_date?.split('T')[0] || 'N/A'}\n🟢 *Country:* ${info.country || 'Global'}\n🔒 *HTTPS:* ${info.isDead === 'False' ? '✅ Live' : '❌ Dead'}\n\n> ${config.BOT_NAME}`);
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Domain lookup failed: ${err.message}\n\n> ${config.BOT_NAME}`);
    }
    return;
  }
};

export default tools;
