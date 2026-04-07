import config from '../config.cjs';
import axios from 'axios';
import { sendBtn } from '../lib/sendBtn.js';

// Multiple anime/waifu image APIs (all free, no key)
async function getWaifuPics(type = 'waifu', nsfw = false) {
  const mode = nsfw ? 'nsfw' : 'sfw';
  const res = await axios.get(`https://api.waifu.pics/${mode}/${type}`, { timeout: 10000 });
  return res.data?.url;
}

async function getNekos(endpoint = 'neko') {
  const res = await axios.get(`https://nekos.best/api/v2/${endpoint}`, { timeout: 10000 });
  return res.data?.results?.[0]?.url;
}

async function getWaifuIm(tags = ['waifu']) {
  const res = await axios.post('https://api.waifu.im/search', {
    included_tags: tags,
    many: false,
  }, { timeout: 10000 });
  return res.data?.images?.[0]?.url;
}

const SFW_TYPES = {
  waifu: { api: 'waifu.pics', type: 'waifu', emoji: '🌸' },
  neko: { api: 'waifu.pics', type: 'neko', emoji: '🐱' },
  shinobu: { api: 'waifu.pics', type: 'shinobu', emoji: '⚔️' },
  megumin: { api: 'waifu.pics', type: 'megumin', emoji: '💥' },
  bully: { api: 'waifu.pics', type: 'bully', emoji: '😈' },
  cuddle: { api: 'waifu.pics', type: 'cuddle', emoji: '🤗' },
  cry: { api: 'waifu.pics', type: 'cry', emoji: '😢' },
  hug: { api: 'waifu.pics', type: 'hug', emoji: '🤗' },
  awoo: { api: 'waifu.pics', type: 'awoo', emoji: '🐺' },
  lick: { api: 'waifu.pics', type: 'lick', emoji: '👅' },
  pat: { api: 'waifu.pics', type: 'pat', emoji: '✋' },
  smug: { api: 'waifu.pics', type: 'smug', emoji: '😏' },
  bonk: { api: 'waifu.pics', type: 'bonk', emoji: '🔨' },
  blush: { api: 'waifu.pics', type: 'blush', emoji: '😊' },
  smile: { api: 'waifu.pics', type: 'smile', emoji: '😄' },
  wave: { api: 'waifu.pics', type: 'wave', emoji: '👋' },
  dance: { api: 'nekos', type: 'dance', emoji: '💃' },
  slap: { api: 'nekos', type: 'slap', emoji: '👋' },
  poke: { api: 'nekos', type: 'poke', emoji: '☝️' },
  handshake: { api: 'nekos', type: 'handshake', emoji: '🤝' },
  kick: { api: 'nekos', type: 'kick', emoji: '🦵' },
  shoot: { api: 'nekos', type: 'shoot', emoji: '🔫' },
  highfive: { api: 'nekos', type: 'highfive', emoji: '✋' },
  wink: { api: 'nekos', type: 'wink', emoji: '😉' },
  nom: { api: 'nekos', type: 'nom', emoji: '😋' },
  bite: { api: 'nekos', type: 'bite', emoji: '😤' },
  glomp: { api: 'nekos', type: 'glomp', emoji: '🤗' },
  stare: { api: 'nekos', type: 'stare', emoji: '👁️' },
  sleep: { api: 'nekos', type: 'sleep', emoji: '😴' },
  thumbsup: { api: 'nekos', type: 'thumbsup', emoji: '👍' },
};

const anime = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(config.PREFIX)) return;
  const args = body.slice(config.PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');
  const target = m.mentionedJid?.[0] || m.quoted?.sender;
  const senderName = m.pushName || 'Someone';
  const targetName = target ? `@${target.split('@')[0]}` : 'Someone';

  // ─── ANIME MENU ───
  if (['animelist', 'anime-list', 'animemenu', 'animecmds'].includes(cmd)) {
    await m.React('🎌');
    const list = Object.entries(SFW_TYPES).map(([k, v]) => `${v.emoji} ${config.PREFIX}${k}`).join('\n');
    await sendBtn(conn, m.from, {
      body: `🎌 *ANIME COMMANDS*\n\n${list}\n\n_All anime images are SFW (Safe for Work)_`,
      footer: `${config.BOT_NAME} | waifu.pics + nekos.best`,
      buttons: [
        { text: `${config.PREFIX}waifu`, id: `${config.PREFIX}waifu` },
        { text: `${config.PREFIX}neko`, id: `${config.PREFIX}neko` },
        { text: `${config.PREFIX}hug @user`, id: `${config.PREFIX}hug` },
      ],
    }, m);
    return;
  }

  // ─── SHIP ───
  if (['ship', 'love', 'lovemeter'].includes(cmd)) {
    await m.React('💕');
    const user1 = senderName;
    const user2 = target ? targetName : q || 'Someone';
    const percent = Math.floor(Math.random() * 101);
    const hearts = '❤️'.repeat(Math.floor(percent / 10)) + '🖤'.repeat(10 - Math.floor(percent / 10));
    let status;
    if (percent >= 90) status = '😍 SOULMATES!';
    else if (percent >= 70) status = '💑 Perfect Match!';
    else if (percent >= 50) status = '😊 Good Couple!';
    else if (percent >= 30) status = '😅 Just Friends!';
    else status = '💔 Not Compatible!';
    await m.reply(`💕 *Love Meter*\n\n${user1} 💖 ${user2}\n\n${hearts}\n\n*${percent}%* — ${status}\n\n> ${config.BOT_NAME}`, { mentions: target ? [target] : [] });
    return;
  }

  // ─── WAIFUIM SPECIAL ───
  if (['waifuim', 'waifuimages'].includes(cmd)) {
    await m.React('🌸');
    try {
      const url = await getWaifuIm(['waifu']);
      await conn.sendMessage(m.from, {
        image: { url },
        caption: `🌸 *Waifu Image*\n\n> ${config.BOT_NAME}`,
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err) {
      await m.React('❌');
      await m.reply(`❌ Failed: ${err.message}`);
    }
    return;
  }

  // ─── HANDLE ALL ANIME TYPES ───
  const animeType = SFW_TYPES[cmd];
  if (!animeType) return;

  await m.React(animeType.emoji);

  // Build action caption for interaction types
  const actionCaptions = {
    hug: `🤗 *${senderName}* hugs ${target ? targetName : 'everyone'}!`,
    pat: `✋ *${senderName}* pats ${target ? targetName : 'someone'}!`,
    slap: `👋 *${senderName}* slaps ${target ? targetName : 'someone'}!`,
    poke: `☝️ *${senderName}* pokes ${target ? targetName : 'someone'}!`,
    cuddle: `🤗 *${senderName}* cuddles ${target ? targetName : 'someone'}!`,
    kick: `🦵 *${senderName}* kicks ${target ? targetName : 'someone'}!`,
    bite: `😤 *${senderName}* bites ${target ? targetName : 'someone'}!`,
    lick: `👅 *${senderName}* licks ${target ? targetName : 'someone'}!`,
    bonk: `🔨 *${senderName}* bonks ${target ? targetName : 'someone'}!`,
    highfive: `✋ *${senderName}* high fives ${target ? targetName : 'someone'}!`,
    shoot: `🔫 *${senderName}* shoots ${target ? targetName : 'someone'}!`,
    glomp: `🤗 *${senderName}* glomps ${target ? targetName : 'someone'}!`,
    wave: `👋 *${senderName}* waves at ${target ? targetName : 'everyone'}!`,
    handshake: `🤝 *${senderName}* shakes hands with ${target ? targetName : 'someone'}!`,
  };

  const caption = actionCaptions[cmd]
    || `${animeType.emoji} *${cmd.charAt(0).toUpperCase() + cmd.slice(1)}*`;

  try {
    let url;
    if (animeType.api === 'waifu.pics') {
      url = await getWaifuPics(animeType.type, false);
    } else {
      url = await getNekos(animeType.type);
    }

    if (!url) throw new Error('No image found');

    await conn.sendMessage(m.from, {
      image: { url },
      caption: `${caption}\n\n> ${config.BOT_NAME}`,
      ...(target ? { mentions: [target] } : {}),
    }, { quoted: { key: m.key, message: m.message } });
    await m.React('✅');
  } catch {
    // Try fallback API
    try {
      const fallbackUrl = await getWaifuIm(['waifu']);
      await conn.sendMessage(m.from, {
        image: { url: fallbackUrl },
        caption: `${caption}\n\n> ${config.BOT_NAME}`,
        ...(target ? { mentions: [target] } : {}),
      }, { quoted: { key: m.key, message: m.message } });
      await m.React('✅');
    } catch (err2) {
      await m.React('❌');
      await m.reply(`❌ Failed to fetch image: ${err2.message}`);
    }
  }
};

export default anime;
