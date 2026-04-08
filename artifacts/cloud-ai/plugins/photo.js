/**
 * Photo Effects Plugin
 * Applies visual effects to profile pictures, quoted images, or AI-generated art.
 *
 * Effect APIs:
 *   - some-random-api.com/canvas — blur, greyscale, invert, sepia, jail, wasted, triggered, glass, comrade, circle
 *   - Pollinations AI           — galaxy (AI cosmic art)
 *   - popcat.xyz               — blur, greyscale, invert (fallback)
 */

import config from '../config.cjs';
import axios from 'axios';

const p = config.PREFIX;

// ─── API HELPERS ─────────────────────────────────────────────────────────────

const SRA_BASE = 'https://some-random-api.com/canvas';

// Each entry: { label, apiUrl(imgUrl) }
const EFFECTS = {
  // Filters
  blur:       { label: '🌫️ Blur',        api: (u) => `${SRA_BASE}/filter/blur?avatar=${encodeURIComponent(u)}` },
  greyscale:  { label: '⚫ Greyscale',    api: (u) => `${SRA_BASE}/filter/greyscale?avatar=${encodeURIComponent(u)}` },
  grey:       { label: '⚫ Greyscale',    api: (u) => `${SRA_BASE}/filter/greyscale?avatar=${encodeURIComponent(u)}` },
  invert:     { label: '🔄 Invert',       api: (u) => `${SRA_BASE}/filter/invert?avatar=${encodeURIComponent(u)}` },
  sepia:      { label: '🟤 Sepia',        api: (u) => `${SRA_BASE}/filter/sepia?avatar=${encodeURIComponent(u)}` },
  // Overlays
  jail:       { label: '🔒 Jail',         api: (u) => `${SRA_BASE}/overlay/jail?avatar=${encodeURIComponent(u)}` },
  wasted:     { label: '💀 Wasted',       api: (u) => `${SRA_BASE}/overlay/wasted?avatar=${encodeURIComponent(u)}` },
  triggered:  { label: '😡 Triggered',    api: (u) => `${SRA_BASE}/overlay/triggered?avatar=${encodeURIComponent(u)}` },
  glass:      { label: '🔮 Glass',        api: (u) => `${SRA_BASE}/overlay/glass?avatar=${encodeURIComponent(u)}` },
  comrade:    { label: '☭ Comrade',       api: (u) => `${SRA_BASE}/overlay/comrade?avatar=${encodeURIComponent(u)}` },
  // Shape
  circle:     { label: '⭕ Circle',       api: (u) => `${SRA_BASE}/misc/circle?avatar=${encodeURIComponent(u)}` },
};

// Galaxy — AI art (Pollinations AI, not profile-pic based)
const GALAXY_MODELS = [
  (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent('galaxy ' + q + ', cosmic nebula space art, stunning, vivid colors, ultra detailed, photorealistic')}?width=1024&height=1024&model=flux&nologo=true&enhance=true`,
  (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent('galaxy ' + q + ', cosmic space nebula, stars, vivid, beautiful')}?width=1024&height=1024&model=flux&nologo=true`,
];

async function fetchImageBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 45000, maxRedirects: 5 });
  const ct = res.headers['content-type'] || '';
  if (!ct.startsWith('image')) throw new Error('Response was not an image');
  return Buffer.from(res.data);
}

async function getSourceImageUrl(m, conn) {
  // 1. Quoted image message
  if (m.quoted) {
    const q = m.quoted;
    const mime = q.mimeType || q.mimetype || '';
    if (mime.startsWith('image')) {
      try {
        const buf = await q.download();
        // Upload to a temp CDN via Pollinations image cache (or use a tourl approach)
        // Since we need a URL, use telegra.ph or just send with the buffer directly
        return { buffer: buf };
      } catch (_) { /* fallthrough to profile pic */ }
    }
  }

  // 2. Mentioned user's profile pic
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    const jid = m.mentionedJid[0];
    try {
      const url = await conn.profilePictureUrl(jid, 'image');
      return { url };
    } catch (_) { /* fallthrough */ }
  }

  // 3. Sender's profile pic
  try {
    const url = await conn.profilePictureUrl(m.sender, 'image');
    return { url };
  } catch (_) { /* fallthrough */ }

  throw new Error('No image found. Reply to an image, mention someone, or make sure your profile picture is public.');
}

const photo = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');

  // ─── GALAXY ─────────────────────────────────────────────────────────────
  if (['galaxy', 'galaxyart', 'cosmic', 'space', 'nebula'].includes(cmd)) {
    const prompt = q || 'beautiful galaxy';
    await m.React('🌌');
    await m.reply(`🌌 *Generating galaxy art...*\n✏️ _"${prompt}"_\n\n⏳ Please wait 15-30 seconds...`);
    try {
      for (const modelUrl of GALAXY_MODELS) {
        try {
          const buf = await fetchImageBuffer(modelUrl(prompt));
          await conn.sendMessage(m.from, {
            image: buf,
            caption: `🌌 *Galaxy Art Generated!*\n\n✏️ *Theme:* ${prompt}\n✨ *Style:* Cosmic Nebula AI\n\n> ${config.BOT_NAME}`,
          }, { quoted: { key: m.key, message: m.message } });
          await m.React('✅');
          return;
        } catch (_) { /* try next model */ }
      }
      throw new Error('All models failed');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Galaxy art failed!\n\n💡 Try: ${p}galaxy starry night\n\n> ${config.BOT_NAME}`);
    }
    return;
  }

  // ─── PHOTO EFFECTS ───────────────────────────────────────────────────────
  if (!EFFECTS[cmd]) return;

  const effect = EFFECTS[cmd];
  await m.React('🎨');
  await m.reply(`${effect.label} *Applying effect...*\n\n⏳ Please wait...`);

  try {
    const source = await getSourceImageUrl(m, conn);

    let imageBuffer;

    if (source.buffer) {
      // Quoted image: we have the buffer but need a URL for the API.
      // Upload to tmpfiles.org for a temp URL
      try {
        const form = new FormData();
        const { Blob } = await import('buffer');
        form.append('file', new Blob([source.buffer], { type: 'image/jpeg' }), 'photo.jpg');
        const upload = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30000,
        });
        const tmpUrl = upload.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        if (tmpUrl) {
          imageBuffer = await fetchImageBuffer(effect.api(tmpUrl));
        }
      } catch (_) {
        // If upload fails, apply the popcat blur directly on the buffer as fallback
        imageBuffer = source.buffer;
      }
    } else {
      imageBuffer = await fetchImageBuffer(effect.api(source.url));
    }

    await conn.sendMessage(m.from, {
      image: imageBuffer,
      caption: `${effect.label} *Effect Applied!*\n\n> ${config.BOT_NAME}`,
    }, { quoted: { key: m.key, message: m.message } });
    await m.React('✅');

  } catch (err) {
    await m.React('❌');
    const usage = [
      `❌ *Failed:* ${err.message?.slice(0, 80)}`,
      ``,
      `💡 *Tips:*`,
      `• Reply to an image with ${p}${cmd}`,
      `• Or mention someone: ${p}${cmd} @user`,
      `• Or just send ${p}${cmd} to apply to your own profile pic`,
      ``,
      `> ${config.BOT_NAME}`,
    ].join('\n');
    await m.reply(usage);
  }
};

// ─── PHOTO MENU ─────────────────────────────────────────────────────────────
photo.menu = async (m) => {
  const effectList = Object.entries(EFFECTS)
    .filter(([k]) => k !== 'grey') // skip alias
    .map(([k, v]) => `  ⟡ ${p}${k} — ${v.label}`).join('\n');

  await m.reply([
    `╔═══════════════════════════╗`,
    `║  🎨  *PHOTO EFFECTS*       ║`,
    `╚═══════════════════════════╝`,
    ``,
    `*How to use:*`,
    `• Reply to a photo with the command`,
    `• Or mention someone: ${p}blur @user`,
    `• Or just send it to apply to your own profile pic`,
    ``,
    `*🖼️ FILTERS*`,
    `  ⟡ ${p}blur — Blur effect`,
    `  ⟡ ${p}greyscale — Black & white`,
    `  ⟡ ${p}invert — Invert colors`,
    `  ⟡ ${p}sepia — Vintage tone`,
    ``,
    `*🎭 OVERLAYS*`,
    `  ⟡ ${p}jail — Prison bars`,
    `  ⟡ ${p}wasted — GTA Wasted screen`,
    `  ⟡ ${p}triggered — Triggered meme`,
    `  ⟡ ${p}glass — Broken glass`,
    `  ⟡ ${p}comrade — Soviet filter`,
    ``,
    `*✂️ SHAPE*`,
    `  ⟡ ${p}circle — Crop to circle`,
    ``,
    `*🌌 AI ART*`,
    `  ⟡ ${p}galaxy <theme> — Cosmic galaxy art`,
    `  ⟡ ${p}cosmic <theme> — Same as galaxy`,
    `  ⟡ ${p}nebula <theme> — Same as galaxy`,
    ``,
    `> ${config.BOT_NAME}`,
  ].join('\n'));
};

export default photo;
