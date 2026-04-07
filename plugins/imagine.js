import config from '../config.cjs';
import axios from 'axios';
import { sendBtn } from '../lib/sendBtn.js';

const API = config.GIFTED_API || 'https://api.giftedtech.co.ke/api';
const KEY = config.GIFTED_API_KEY || 'gifted';

// Multiple image generation backends (all free, no key needed for Pollinations)
const IMAGINE_MODELS = {
  imagine: { label: 'FLUX', url: (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&model=flux&nologo=true&enhance=true` },
  flux: { label: 'FLUX Dev', url: (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&model=flux&nologo=true` },
  dalle: { label: 'DALL-E', url: (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&model=openai&nologo=true` },
  sdxl: { label: 'SDXL', url: (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&model=turbo&nologo=true` },
  pixart: { label: 'PixArt', url: (q) => `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&model=flux-realism&nologo=true` },
};

async function genImage(model, prompt) {
  const m = IMAGINE_MODELS[model] || IMAGINE_MODELS.imagine;
  const url = m.url(prompt);
  // Verify it returns an image
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxRedirects: 5 });
  const ct = res.headers['content-type'] || '';
  if (!ct.startsWith('image')) throw new Error('No image returned');
  return { buffer: Buffer.from(res.data), url, label: m.label };
}

const imagine = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  if (!Object.keys(IMAGINE_MODELS).includes(cmd)) return;

  if (!q) {
    return sendBtn(conn, m.from, {
      body: `🎨 *${IMAGINE_MODELS[cmd]?.label || 'AI'} Image Generator*\n\n❌ Please provide a prompt!\n\n*Usage:* ${config.PREFIX}${cmd} <your prompt>\n\n*Examples:*\n• ${config.PREFIX}${cmd} a lion in a forest at sunset\n• ${config.PREFIX}${cmd} cyberpunk city night rain neon\n• ${config.PREFIX}${cmd} beautiful anime girl with blue hair\n• ${config.PREFIX}${cmd} abstract art colorful geometric`,
      footer: `${config.BOT_NAME} | Powered by Pollinations AI`,
      buttons: Object.keys(IMAGINE_MODELS).map(k => ({
        text: `${config.PREFIX}${k}`,
        id: `${config.PREFIX}${k} beautiful sunset landscape`,
      })).slice(0, 3),
    }, m);
  }

  await m.React('🎨');
  await m.reply(`🎨 *Generating "${q}"...*\n\n⏳ Please wait, this may take 15-30 seconds!`);

  try {
    const { buffer, label } = await genImage(cmd, q);
    await conn.sendMessage(m.from, {
      image: buffer,
      caption: `🎨 *AI Image Generated!*\n\n✏️ *Prompt:* ${q}\n🤖 *Model:* ${label}\n\n> ${config.BOT_NAME}`,
    }, { quoted: { key: m.key, message: m.message } });
    await m.React('✅');

    // Send buttons after image
    await sendBtn(conn, m.from, {
      body: `✅ *Image ready!* Want to generate more?`,
      footer: `${config.BOT_NAME}`,
      buttons: [
        { text: `🔄 Regenerate`, id: `${config.PREFIX}${cmd} ${q}` },
        { text: `🌟 Try FLUX`, id: `${config.PREFIX}flux ${q}` },
        { text: `🎨 Try DALL-E`, id: `${config.PREFIX}dalle ${q}` },
      ],
    }, m);
  } catch (err) {
    await m.React('❌');
    await sendBtn(conn, m.from, {
      body: `❌ *Image generation failed*\n\n💡 *Tip:* Try a different prompt or model\n\n*Error:* ${err.message?.slice(0, 80)}`,
      footer: `${config.BOT_NAME}`,
      buttons: [
        { text: `🔄 Try Again`, id: `${config.PREFIX}${cmd} ${q}` },
        { text: `🌟 Try FLUX`, id: `${config.PREFIX}flux ${q}` },
        { text: `🎨 Try DALL-E`, id: `${config.PREFIX}dalle ${q}` },
      ],
    }, m);
  }
};

export default imagine;
