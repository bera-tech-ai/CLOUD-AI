/**
 * Photo Effects Plugin
 * Applies visual effects to profile pictures or quoted images.
 *
 * APIs:
 *   - some-random-api.com/canvas — filters, overlays, shapes, misc
 *   - Pollinations AI            — galaxy / cosmic AI art
 */

import config from '../config.cjs';
import axios from 'axios';
import { resolveLid } from '../lib/Serializer.js';
import pkg from '@whiskeysockets/baileys';
const { downloadMediaMessage } = pkg;

const p = config.PREFIX;
const SRA = 'https://some-random-api.com/canvas';

// ─── ALL EFFECTS ─────────────────────────────────────────────────────────────
const EFFECTS = {
  // Filters
  blur:       { label: '🌫️ Blur',        api: (u) => `${SRA}/filter/blur?avatar=${enc(u)}` },
  greyscale:  { label: '⚫ Greyscale',    api: (u) => `${SRA}/filter/greyscale?avatar=${enc(u)}` },
  grey:       { label: '⚫ Greyscale',    api: (u) => `${SRA}/filter/greyscale?avatar=${enc(u)}` },
  invert:     { label: '🔄 Invert',       api: (u) => `${SRA}/filter/invert?avatar=${enc(u)}` },
  sepia:      { label: '🟤 Sepia',        api: (u) => `${SRA}/filter/sepia?avatar=${enc(u)}` },
  pixelate:   { label: '🔲 Pixelate',     api: (u) => `${SRA}/filter/pixelate?avatar=${enc(u)}` },
  mirror:     { label: '🪞 Mirror',       api: (u) => `${SRA}/filter/mirror?avatar=${enc(u)}` },
  flip:       { label: '🔃 Flip',         api: (u) => `${SRA}/filter/flip?avatar=${enc(u)}` },
  brighten:   { label: '☀️ Brighten',     api: (u) => `${SRA}/filter/brighten?avatar=${enc(u)}` },
  darken:     { label: '🌑 Darken',       api: (u) => `${SRA}/filter/darken?avatar=${enc(u)}` },
  // Overlays
  jail:       { label: '🔒 Jail',         api: (u) => `${SRA}/overlay/jail?avatar=${enc(u)}` },
  wasted:     { label: '💀 Wasted',       api: (u) => `${SRA}/overlay/wasted?avatar=${enc(u)}` },
  triggered:  { label: '😡 Triggered',    api: (u) => `${SRA}/overlay/triggered?avatar=${enc(u)}` },
  glass:      { label: '🔮 Glass',        api: (u) => `${SRA}/overlay/glass?avatar=${enc(u)}` },
  comrade:    { label: '☭ Comrade',       api: (u) => `${SRA}/overlay/comrade?avatar=${enc(u)}` },
  gay:        { label: '🏳️‍🌈 Gay Pride',   api: (u) => `${SRA}/overlay/gay?avatar=${enc(u)}` },
  // Shape / Misc
  circle:     { label: '⭕ Circle',       api: (u) => `${SRA}/misc/circle?avatar=${enc(u)}` },
  simpcard:   { label: '🃏 Simp Card',    api: (u) => `${SRA}/misc/simpcard?avatar=${enc(u)}` },
  horny:      { label: '😈 Horny Card',   api: (u) => `${SRA}/misc/horny?avatar=${enc(u)}` },
  lolice:     { label: '👮 Lolice Card',  api: (u) => `${SRA}/misc/lolice?avatar=${enc(u)}` },
};

function enc(u) { return encodeURIComponent(u); }

// ─── IMAGE SOURCE RESOLVER ────────────────────────────────────────────────────
async function getImageUrl(m, conn) {
  // 1. Quoted image — download and upload to get a public URL
  if (m.quoted) {
    const qtype = m.quoted.type || '';
    if (['imageMessage', 'stickerMessage'].includes(qtype)) {
      try {
        const buf = await downloadMediaMessage(
          { message: m.quoted.message, key: m.quoted.key },
          'buffer', {}
        );
        const url = await uploadToTmpfiles(buf);
        if (url) return url;
      } catch (_) {}
    }
  }

  // 2. Mentioned user's profile pic — resolve @lid first
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const rawJid = m.mentionedJid[0];
    const jid = resolveLid(rawJid) || rawJid;
    try {
      return await conn.profilePictureUrl(jid, 'image');
    } catch (_) {}
  }

  // 3. Sender's own profile pic — resolve @lid for groups
  const senderJid = resolveLid(m.sender) || m.sender;
  try {
    return await conn.profilePictureUrl(senderJid, 'image');
  } catch (_) {}

  throw new Error(
    `Could not get a photo!\n` +
    `• Reply to a photo with ${p}${m.body?.split(' ')[0]?.replace(p,'') || 'blur'}\n` +
    `• Or tag someone: ${p}wasted @user\n` +
    `• Or make your profile pic public in WA Privacy settings`
  );
}

// Upload buffer to tmpfiles.org to get a public URL
async function uploadToTmpfiles(buf) {
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', buf, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: form.getHeaders(),
      timeout: 20000,
    });
    const raw = res.data?.data?.url;
    if (!raw) return null;
    return raw.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  } catch (_) {
    return null;
  }
}

async function fetchImageBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 45000, maxRedirects: 5 });
  const ct = res.headers['content-type'] || '';
  if (!ct.startsWith('image')) throw new Error('Response was not an image');
  return Buffer.from(res.data);
}

// ─── SEND HELPER — avoids m.reply timeout in groups ──────────────────────────
async function send(conn, m, content) {
  try {
    await conn.sendMessage(m.from, content);
  } catch (err) {
    console.error('[PHOTO SEND ERR]', err?.message);
  }
}

// ─── MAIN PLUGIN ─────────────────────────────────────────────────────────────
const photo = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args  = body.slice(p.length).trim().split(/\s+/);
  const cmd   = args[0].toLowerCase();
  const q     = args.slice(1).join(' ');

  // ─── GALAXY / COSMIC AI ART ────────────────────────────────────────────────
  if (['galaxy', 'galaxyart', 'cosmic', 'space', 'nebula'].includes(cmd)) {
    const prompt = q || 'beautiful galaxy';
    await m.React('🌌');
    await send(conn, m, { text: `🌌 *Generating galaxy art...*\n✏️ _"${prompt}"_\n\n⏳ Please wait 15-30 seconds...` });
    const models = [
      `https://image.pollinations.ai/prompt/${enc('galaxy ' + prompt + ', cosmic nebula space art, stunning, vivid colors, ultra detailed, photorealistic')}?width=1024&height=1024&model=flux&nologo=true&enhance=true`,
      `https://image.pollinations.ai/prompt/${enc('galaxy ' + prompt + ', cosmic space nebula, stars, vivid, beautiful')}?width=1024&height=1024&model=flux&nologo=true`,
    ];
    for (const url of models) {
      try {
        const buf = await fetchImageBuffer(url);
        await conn.sendMessage(m.from, {
          image: buf,
          caption: `🌌 *Galaxy Art*\n✏️ *Theme:* ${prompt}\n\n> ${config.BOT_NAME}`,
        });
        await m.React('✅');
        return;
      } catch (_) {}
    }
    await m.React('❌');
    await send(conn, m, { text: `❌ Galaxy art failed! Try: ${p}galaxy starry night\n\n> ${config.BOT_NAME}` });
    return;
  }

  // ─── PHOTO EFFECTS ─────────────────────────────────────────────────────────
  if (!EFFECTS[cmd]) return;

  const effect = EFFECTS[cmd];
  await m.React('🎨');
  await send(conn, m, { text: `${effect.label} *Applying effect...*\n⏳ Please wait...` });

  try {
    const imgUrl = await getImageUrl(m, conn);
    const apiUrl = effect.api(imgUrl);
    const buf    = await fetchImageBuffer(apiUrl);

    await conn.sendMessage(m.from, {
      image: buf,
      caption: `${effect.label} *Done!*\n\n> ${config.BOT_NAME}`,
    });
    await m.React('✅');

  } catch (err) {
    await m.React('❌');
    await send(conn, m, {
      text: [
        `❌ *Failed:* ${err.message?.slice(0, 120)}`,
        ``,
        `💡 *How to use:*`,
        `• Reply to a photo: reply then send ${p}${cmd}`,
        `• Tag someone: ${p}${cmd} @user`,
        `• Or just send ${p}${cmd} alone (uses your profile pic)`,
        ``,
        `> ${config.BOT_NAME}`,
      ].join('\n'),
    });
  }
};

export default photo;
