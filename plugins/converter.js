import config from '../config.cjs';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const converter = async (m, conn) => {
  if (!m.body && !m.isSticker && m.type !== 'imageMessage') return;
  const body = (m.body || '').trim();
  const prefix = config.PREFIX;
  if (body && !body.startsWith(prefix)) return;

  const args = body ? body.slice(prefix.length).trim().split(/\s+/) : [];
  const cmd = args[0]?.toLowerCase() || '';
  const q = args.slice(1).join(' ');

  // ─── STICKER (image/video/gif → sticker) ───
  if (['sticker', 'st', 'take', 's'].includes(cmd)) {
    const quotedImg = m.quoted?.message?.imageMessage || m.quoted?.message?.videoMessage;
    const currImg = m.message?.imageMessage;
    if (!quotedImg && !currImg) return m.reply('❌ Please send or quote an image/video with .sticker');
    await m.React('🔄');
    try {
      const media = quotedImg || currImg;
      const isVideo = !!(m.quoted?.message?.videoMessage || m.message?.videoMessage);
      const buffer = await downloadMediaMessage(
        m.quoted?.message ? { message: m.quoted.message, key: m.quoted.key } : m,
        'buffer', {}
      );
      const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
      const packName = q || config.BOT_NAME;
      const sticker = new Sticker(buffer, {
        pack: packName,
        author: config.OWNER_NAME,
        type: StickerTypes.FULL,
        categories: ['🤩', '🎉'],
        id: '12345',
        quality: 75,
        background: 'transparent',
      });
      const stickerBuffer = await sticker.toBuffer();
      await conn.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Sticker failed: ${err.message}`);
    }
    return;
  }

  // ─── TO IMAGE (sticker → image) ───
  if (['toimg', 's2img', 'stickertoimg', 'stimg'].includes(cmd)) {
    const quotedSticker = m.quoted?.message?.stickerMessage;
    if (!quotedSticker) return m.reply('❌ Please quote a sticker with .toimg');
    await m.React('🔄');
    try {
      const buffer = await downloadMediaMessage(
        { message: m.quoted.message, key: m.quoted.key }, 'buffer', {}
      );
      const sharp = (await import('sharp')).default;
      const imgBuffer = await sharp(buffer).png().toBuffer();
      await conn.sendMessage(m.from, {
        image: imgBuffer,
        caption: `🖼️ *Sticker → Image*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Conversion failed: ${err.message}`);
    }
    return;
  }

  // ─── TO AUDIO (video → mp3) ───
  if (['toaudio', 'tomp3', 'extractaudio'].includes(cmd)) {
    const quotedVideo = m.quoted?.message?.videoMessage;
    if (!quotedVideo) return m.reply('❌ Please quote a video with .toaudio');
    await m.React('🔄');
    try {
      const buffer = await downloadMediaMessage(
        { message: m.quoted.message, key: m.quoted.key }, 'buffer', {}
      );
      const tmpIn = path.join(tmpDir, `vid_${Date.now()}.mp4`);
      const tmpOut = path.join(tmpDir, `aud_${Date.now()}.mp3`);
      fs.writeFileSync(tmpIn, buffer);
      const { execFile } = await import('child_process');
      const { default: ffmpegPath } = await import('ffmpeg-static');
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, ['-i', tmpIn, '-vn', '-acodec', 'libmp3lame', '-ab', '128k', '-y', tmpOut], { timeout: 60000 }, (err) => err ? reject(err) : resolve());
      });
      const audioBuffer = fs.readFileSync(tmpOut);
      fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
      await conn.sendMessage(m.from, {
        audio: audioBuffer,
        mimetype: 'audio/mpeg',
        fileName: 'audio.mp3',
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Conversion failed: ${err.message}`);
    }
    return;
  }

  // ─── VIEW ONCE OPENER (.vv) ───
  if (['vv', 'viewonce', 'antiviewonce', 'view'].includes(cmd)) {
    const qMsg = m.quoted?.message;
    if (!qMsg) return m.reply('❌ Reply to a view-once message with .vv');
    await m.React('👁️');
    try {
      // Handle view-once messages (viewOnceMessage wrapper)
      const inner = qMsg?.viewOnceMessage?.message || qMsg?.viewOnceMessageV2?.message || qMsg?.viewOnceMessageV2Extension?.message || qMsg;
      const imgMsg = inner?.imageMessage;
      const vidMsg = inner?.videoMessage;
      const audioMsg = inner?.audioMessage;
      if (!imgMsg && !vidMsg && !audioMsg) return m.reply('❌ The quoted message is not a view-once media');
      const targetMsg = m.quoted?.message?.viewOnceMessage?.message
        ? { message: { viewOnceMessage: { message: inner } }, key: m.quoted.key }
        : { message: qMsg, key: m.quoted.key };
      const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
      if (imgMsg) {
        await conn.sendMessage(m.from, { image: buffer, caption: `👁️ *View Once Image*\n> ${config.BOT_NAME}` });
      } else if (vidMsg) {
        await conn.sendMessage(m.from, { video: buffer, caption: `👁️ *View Once Video*\n> ${config.BOT_NAME}` });
      } else if (audioMsg) {
        await conn.sendMessage(m.from, { audio: buffer, mimetype: 'audio/mpeg', fileName: 'viewonce.mp3' });
      }
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Could not open view-once: ${err.message}`);
    }
    return;
  }

  // ─── TO PTT (audio → voice note) ───
  if (['toptt', 'tovoice', 'tovn', 'tovoicenote', 'ptt'].includes(cmd)) {
    const quotedAudio = m.quoted?.message?.audioMessage;
    if (!quotedAudio) return m.reply('❌ Please quote an audio message with .toptt');
    await m.React('🔄');
    try {
      const buffer = await downloadMediaMessage(
        { message: m.quoted.message, key: m.quoted.key }, 'buffer', {}
      );
      const tmpIn = path.join(tmpDir, `aud_${Date.now()}.mp3`);
      const tmpOut = path.join(tmpDir, `ptt_${Date.now()}.ogg`);
      fs.writeFileSync(tmpIn, buffer);
      const { execFile } = await import('child_process');
      const { default: ffmpegPath } = await import('ffmpeg-static');
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, ['-i', tmpIn, '-c:a', 'libopus', '-b:a', '128k', '-y', tmpOut], { timeout: 60000 }, (err) => err ? reject(err) : resolve());
      });
      const pttBuffer = fs.readFileSync(tmpOut);
      fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
      await conn.sendMessage(m.from, {
        audio: pttBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Conversion failed: ${err.message}`);
    }
    return;
  }
};

export default converter;
