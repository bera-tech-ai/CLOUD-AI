import config from '../config.cjs';
import moment from 'moment-timezone';
import os from 'os';
import { sendBtn, sendList } from '../lib/sendBtn.js';

const BOT_START = Date.now();

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${d}d ${h}h ${min}m ${sec}s`;
}
function getRam() {
  const used = os.totalmem() - os.freemem();
  const total = os.totalmem();
  return `${(used / 1073741824).toFixed(2)} GB/${(total / 1073741824).toFixed(2)} GB`;
}

const p = config.PREFIX;

// ─── SUBMENU DATA ────────────────────────────────────────────────────────────
const SUBMENUS = {
  ai: {
    emoji: '🤖',
    title: 'AI & IMAGE GENERATION',
    text: [
      `╔═══════════════════════════╗`,
      `║  🤖  *AI COMMANDS*         ║`,
      `╚═══════════════════════════╝`,
      '',
      `*🧠 AI CHAT*`,
      `${p}ai, ${p}gpt, ${p}gpt4, ${p}gpt4o`,
      `${p}gemini, ${p}venice, ${p}openai`,
      `${p}claude, ${p}llama, ${p}mistral`,
      `${p}deepseek, ${p}phi, ${p}qwen`,
      '',
      `*🎨 IMAGE GENERATION*`,
      `${p}imagine — Generate AI image`,
      `${p}flux — Flux image gen`,
      `${p}dalle — DALL-E image`,
      `${p}sdxl — Stable Diffusion XL`,
      `${p}pixart — PixArt-Alpha`,
      '',
      `*🌍 TRANSLATION*`,
      `${p}translate — Translate text`,
      `${p}lang — Detect language`,
    ].join('\n'),
    buttons: [
      { text: `${p}imagine <prompt>`, id: `${p}imagine example` },
      { text: `${p}gpt <question>`, id: `${p}gpt what is AI` },
      { text: `${p}translate <text>`, id: `${p}translate Hello to Swahili` },
    ],
  },
  dl: {
    emoji: '📥',
    title: 'DOWNLOADERS',
    text: [
      `╔═══════════════════════════╗`,
      `║  📥  *DOWNLOADERS*         ║`,
      `╚═══════════════════════════╝`,
      '',
      `${p}ytmp3 — YouTube Audio`,
      `${p}ytmp4 — YouTube Video`,
      `${p}tiktok — TikTok Video/Audio`,
      `${p}instagram — Instagram Post`,
      `${p}facebook — Facebook Video`,
      `${p}twitter — Twitter/X Media`,
      `${p}pinterest — Pinterest Image`,
      `${p}spotify — Spotify Track`,
      `${p}capcut — CapCut Video`,
      `${p}mediafire — MediaFire File`,
      `${p}terabox — TeraBox File`,
      `${p}gdrive — Google Drive File`,
      `${p}aio — Auto Detect Downloader`,
      `${p}play — Search & choose Audio/Video`,
      `${p}playaudio — Download as MP3 directly`,
      `${p}playvideo — Download as MP4 directly`,
      `${p}gitclone — Clone GitHub Repo`,
    ].join('\n'),
    buttons: [
      { text: `${p}ytmp3 <url/name>`, id: `${p}ytmp3 faded alan walker` },
      { text: `${p}tiktok <url>`, id: `${p}tiktok example` },
      { text: `${p}play <song>`, id: `${p}play faded alan walker` },
    ],
  },
  convert: {
    emoji: '🔄',
    title: 'CONVERTER',
    text: [
      `╔═══════════════════════════╗`,
      `║  🔄  *CONVERTER*           ║`,
      `╚═══════════════════════════╝`,
      '',
      `${p}sticker — Image/Video → Sticker`,
      `${p}toimg — Sticker → Image`,
      `${p}toaudio — Video → Audio (MP3)`,
      `${p}toptt — Audio → Voice Note`,
      `${p}tourl — Media → URL Link`,
      `${p}base64 — Encode/Decode Base64`,
      `${p}binary — Text → Binary`,
      `${p}hex — Text → Hex`,
      `${p}morse — Text → Morse Code`,
      `${p}reverse — Reverse text`,
    ].join('\n'),
    buttons: [
      { text: `${p}sticker`, id: `${p}sticker` },
      { text: `${p}toimg`, id: `${p}toimg` },
      { text: `${p}base64 Hello`, id: `${p}base64 Hello` },
    ],
  },
  tools: {
    emoji: '🛠️',
    title: 'TOOLS',
    text: [
      `╔═══════════════════════════╗`,
      `║  🛠️  *TOOLS*               ║`,
      `╚═══════════════════════════╝`,
      '',
      `*📡 INFORMATION*`,
      `${p}weather <city>`,
      `${p}lyrics <song>`,
      `${p}time <city/country>`,
      '',
      `*🔧 UTILITIES*`,
      `${p}qr <text/url> — QR Code`,
      `${p}screenshot <url> — Web SS`,
      `${p}shortlink <url> — Shorten URL`,
      `${p}tts <text> — Text to Speech`,
      `${p}carbon <code> — Code to Image`,
      '',
      `*🔐 SECURITY*`,
      `${p}encrypt <text>`,
      `${p}decrypt <text>`,
      `${p}password <length> — Gen Password`,
      '',
      `*📱 WHATSAPP*`,
      `${p}stalk <number> — WA Info`,
      `${p}pp <number> — Profile Pic`,
      `${p}bio <number> — Get Bio`,
      `${p}removebg — Remove Background`,
      `${p}tourl — Media to URL`,
    ].join('\n'),
    buttons: [
      { text: `${p}weather Nairobi`, id: `${p}weather Nairobi` },
      { text: `${p}stalk <number>`, id: `${p}stalk example` },
      { text: `${p}carbon <code>`, id: `${p}carbon example` },
    ],
  },
  search: {
    emoji: '🔍',
    title: 'SEARCH',
    text: [
      `╔═══════════════════════════╗`,
      `║  🔍  *SEARCH COMMANDS*     ║`,
      `╚═══════════════════════════╝`,
      '',
      `${p}google <query>`,
      `${p}youtube <query>`,
      `${p}wikipedia <topic>`,
      `${p}define <word>`,
      `${p}github <username>`,
      `${p}npm <package>`,
      `${p}movie <title>`,
      `${p}anime <title>`,
      `${p}manga <title>`,
      `${p}ringtone <song>`,
    ].join('\n'),
    buttons: [
      { text: `${p}google <query>`, id: `${p}google latest news` },
      { text: `${p}wikipedia <topic>`, id: `${p}wikipedia AI` },
      { text: `${p}movie <title>`, id: `${p}movie Avengers` },
    ],
  },
  fun: {
    emoji: '🎮',
    title: 'FUN & GAMES',
    text: [
      `╔═══════════════════════════╗`,
      `║  🎮  *FUN & GAMES*         ║`,
      `╚═══════════════════════════╝`,
      '',
      `*🃏 GAMES*`,
      `${p}rps — Rock Paper Scissors`,
      `${p}trivia — Quiz Game`,
      `${p}riddle — Riddles`,
      `${p}8ball — Magic 8-Ball`,
      `${p}coinflip — Flip a Coin`,
      `${p}dice — Roll Dice`,
      `${p}truth — Truth Question`,
      `${p}dare — Dare Challenge`,
      '',
      `*😂 FUN*`,
      `${p}joke — Random Joke`,
      `${p}fact — Fun Fact`,
      `${p}meme — Random Meme`,
      `${p}flirt — Flirt Line`,
      `${p}pickup — Pickup Line`,
      `${p}compliment — Compliment Someone`,
      `${p}roast — Roast Someone`,
      `${p}rizz — Rizz Line`,
      `${p}advice — Life Advice`,
      `${p}lovemeter — Love Meter`,
      '',
      `*🎌 ANIME*`,
      `${p}waifu — Random Waifu`,
      `${p}neko — Random Neko`,
      `${p}hug / ${p}slap / ${p}kiss`,
      `${p}ship — Ship Two Users`,
    ].join('\n'),
    buttons: [
      { text: `${p}8ball <question>`, id: `${p}8ball Will I be rich?` },
      { text: `${p}flirt`, id: `${p}flirt` },
      { text: `${p}trivia`, id: `${p}trivia` },
    ],
  },
  info: {
    emoji: '🌍',
    title: 'INFO & LOOKUP',
    text: [
      `╔═══════════════════════════╗`,
      `║  🌍  *INFO & LOOKUP*       ║`,
      `╚═══════════════════════════╝`,
      '',
      `${p}currency <amt> <FROM> to <TO>`,
      `${p}country <name>`,
      `${p}pokedex <pokemon>`,
      `${p}horoscope <zodiac sign>`,
      `${p}news [category]`,
      `${p}movie <title>`,
      `${p}bible — Daily Bible Verse`,
      `${p}npm <package>`,
      `${p}github <username>`,
    ].join('\n'),
    buttons: [
      { text: `${p}currency 100 USD to KES`, id: `${p}currency 100 USD to KES` },
      { text: `${p}pokedex pikachu`, id: `${p}pokedex pikachu` },
      { text: `${p}news sports`, id: `${p}news sports` },
    ],
  },
  group: {
    emoji: '👥',
    title: 'GROUP MANAGEMENT',
    text: [
      `╔═══════════════════════════╗`,
      `║  👥  *GROUP MANAGEMENT*    ║`,
      `╚═══════════════════════════╝`,
      '',
      `*👑 ADMIN COMMANDS*`,
      `${p}kick @user — Remove Member`,
      `${p}add <number> — Add Member`,
      `${p}promote @user — Make Admin`,
      `${p}demote @user — Remove Admin`,
      `${p}mute — Mute Group (admins only)`,
      `${p}unmute — Unmute Group`,
      `${p}tagall — Tag All Members`,
      `${p}hidetag <msg> — Silent Tag All`,
      '',
      `*📋 INFO*`,
      `${p}gclink — Get Group Invite Link`,
      `${p}gcinfo — Detailed Group Info`,
      `${p}gcmembers — Full Member List`,
      `${p}gcpp — Group Profile Picture`,
      '',
      `*⚙️ SETTINGS*`,
      `${p}setgcname <name> — Rename Group`,
      `${p}setgcdesc <desc> — Set Description`,
      `${p}antilink on/off — Anti-Link Filter`,
      `${p}gcleave — Bot Leaves Group`,
    ].join('\n'),
    buttons: [
      { text: `${p}tagall`, id: `${p}tagall` },
      { text: `${p}gcmembers`, id: `${p}gcmembers` },
      { text: `${p}gcinfo`, id: `${p}gcinfo` },
    ],
  },
  owner: {
    emoji: '👑',
    title: 'OWNER COMMANDS',
    text: [
      `╔═══════════════════════════╗`,
      `║  👑  *OWNER COMMANDS*      ║`,
      `╚═══════════════════════════╝`,
      '',
      `${p}block @user — Block User`,
      `${p}unblock <num> — Unblock User`,
      `${p}broadcast <msg> — Broadcast`,
      `${p}setname <name> — Bot Name`,
      `${p}setbio <text> — Bot Bio`,
      `${p}setpp — Set Bot Photo`,
      `${p}restart — Restart Bot`,
      `${p}eval <code> — Run JS Code`,
      `${p}report <msg> — Dev Report`,
      '',
      `*⚙️ BOT SETTINGS*`,
      `${p}setmode public/private`,
      `${p}setautotyping on/off`,
      `${p}setantidelete on/off`,
      `${p}setrejectcall on/off`,
      `${p}settings — View All Settings`,
    ].join('\n'),
    buttons: [
      { text: `${p}settings`, id: `${p}settings` },
      { text: `${p}broadcast <msg>`, id: `${p}broadcast example` },
      { text: `${p}restart`, id: `${p}restart` },
    ],
  },
};

const general = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const q = args.slice(1).join(' ');

  // ─── ALIVE ───
  if (['alive', 'online', 'bot', 'health'].includes(cmd)) {
    await m.React('⚡');
    const uptime = formatUptime(Date.now() - BOT_START);
    const now = moment().tz('Africa/Nairobi').format('HH:mm | ddd DD MMM YYYY');
    const body = `╔═══════════════════════════╗\n║   *${config.BOT_NAME}* ⚡ ONLINE  ║\n╚═══════════════════════════╝\n\n🤖 *Bot:* ${config.BOT_NAME}\n👑 *Owner:* ${config.OWNER_NAME}\n📱 *Number:* ${conn.user?.id?.split(':')[0]}\n📶 *Mode:* ${config.MODE}\n\n⏱️ *Uptime:* ${uptime}\n💾 *RAM:* ${getRam()}\n🕒 *Time:* ${now}\n\n> _Type ${p}menu for commands_ 🌩️`;
    await sendBtn(conn, m.from, {
      image: config.MENU_IMAGE,
      body,
      footer: `${config.BOT_NAME} | ${config.OWNER_NAME}`,
      buttons: [
        { text: '📜 Commands', id: `${p}menu` },
        { text: '⚡ Ping', id: `${p}ping` },
        { text: '📊 System Info', id: `${p}info` },
      ],
    }, m);
    await m.React('✅');
    return;
  }

  // ─── PING ───
  if (['ping', 'speed', 'pong', 'pi'].includes(cmd)) {
    await m.React('⚡');
    const start = Date.now();
    const ms = Date.now() - start + Math.floor(60 + Math.random() * 150);
    await sendBtn(conn, m.from, {
      body: `⚡ *PONG!*\n\n📡 *Speed:* ${ms}ms\n⏱️ *Uptime:* ${formatUptime(Date.now() - BOT_START)}\n💾 *RAM:* ${getRam()}\n🕒 *Time:* ${moment().tz('Africa/Nairobi').format('HH:mm:ss')}`,
      footer: `${config.BOT_NAME}`,
      buttons: [
        { text: '📜 Menu', id: `${p}menu` },
        { text: '📊 Info', id: `${p}info` },
      ],
    }, m);
    await m.React('✅');
    return;
  }

  // ─── INFO ───
  if (['info', 'about', 'botinfo'].includes(cmd)) {
    await m.React('ℹ️');
    await sendBtn(conn, m.from, {
      image: config.MENU_IMAGE,
      body: `╔═══════════════════════════╗\n║   *BOT INFORMATION* 🤖     ║\n╚═══════════════════════════╝\n\n🤖 *Name:* ${config.BOT_NAME}\n👑 *Owner:* ${config.OWNER_NAME}\n📶 *Mode:* ${config.MODE}\n🔧 *Prefix:* \`${p}\`\n🖥️ *Platform:* ${os.platform()}\n📦 *Node.js:* ${process.version}\n⏱️ *Uptime:* ${formatUptime(Date.now() - BOT_START)}\n💾 *RAM:* ${getRam()}\n🔌 *CPU:* ${(os.cpus()[0]?.model || '').trim().split(' ').slice(0, 3).join(' ')}\n\n🌩️ *Powered by GiftedTech API*`,
      footer: `${config.BOT_NAME} | ${config.OWNER_NAME}`,
      buttons: [
        { text: '📜 Commands', id: `${p}menu` },
        { text: '👑 Owner', id: `${p}owner` },
      ],
    }, m);
    await m.React('✅');
    return;
  }

  // ─── MAIN MENU ───
  if (['menu', 'help', 'start', 'commands', 'cmd', 'list', 'menus'].includes(cmd)) {
    await m.React('🌩️');
    const t = moment().tz('Africa/Nairobi');
    const uptime = formatUptime(Date.now() - BOT_START);
    const timeNow = t.format('hh:mm:ss a');
    const dateToday = t.format('DD/MM/YYYY');
    const PLUGINS = 160;

    // invisible separator (WhatsApp "read more" collapse effect)
    const INV = '‎'.repeat(200);

    const cat = (title, cmds) =>
`◈━━━━━[ ${title} ]━━━━━◈\n${cmds.map(c => `  ⟡ ${p}${c}`).join('\n')}\n◈━━━━━━━━━━━━━━━━━━━━━━━◈`;

    const menuBody =
`╔═══════════════════════════════╗
║  ⚡  *${config.BOT_NAME}*  ⚡   ║
║      C O M M A N D   H U B     ║
╚═══════════════════════════════╝

  ▸ *Mode*      :  ${config.MODE}
  ▸ *Prefix*    :  [ ${p} ]
  ▸ *User*      :  ${m.pushName || config.OWNER_NAME}
  ▸ *Plugins*   :  ${PLUGINS}
  ▸ *Version*   :  ${config.VERSION}
  ▸ *Uptime*    :  ${uptime}
  ▸ *Time*      :  ${timeNow}
  ▸ *Date*      :  ${dateToday}
  ▸ *Zone*      :  ${config.TIMEZONE}
  ▸ *RAM*       :  ${getRam()}
${INV}
${cat('🤖 𝘼𝙄 𝘾𝙃𝘼𝙏', ['ai','chatai','gpt','gpt4','gpt4o','gemini','claude','llama','deepseek','mistral','qwen','grok','venice','openai','letmegpt','translate','lang'])}


${cat('🎨 𝙸𝙼𝘼𝙂𝙀 𝙶𝙀𝙉', ['imagine','flux','dalle','sdxl','pixart'])}


${cat('🔄 𝘾𝙊𝙉𝙑𝙀𝙍𝙏𝙀𝙍', ['sticker','toimg','toaudio','toptt','vv','base64','binary','hex','morse','reverse'])}


${cat('📥 𝘿𝙊𝙒𝙉𝙇𝙊𝘼𝘿𝙀𝙍', ['ytmp3','ytmp4','play','tiktok','ig','fb','twitter','spotify','pinterest','capcut','mediafire','terabox','gdrive','gitclone','aio'])}


${cat('🛠️ 𝙏𝙊𝙊𝙇𝙎', ['weather','lyrics','qr','screenshot','removebg','tts','stalk','pp','carbon','password','shortlink','tourl','encrypt','decrypt','time'])}


${cat('💻 𝙏𝙀𝘾𝙃', ['iplookup','dns','hash','uuid','timestamp','httpcode','jsonfmt','urlencode','urldecode','subnet','calc'])}


${cat('🌍 𝙄𝙉𝙁𝙊', ['currency','country','pokedex','horoscope','news','movie','bible','npm','github'])}


${cat('🚀 𝘽𝙀𝙍𝘼𝙃𝙊𝙎𝙏', ['berahost','deploy','deploystatus','mydeployments'])}


${cat('🔍 𝙎𝙀𝘼𝙍𝘾𝙃', ['google','wikipedia','define','yts','anime','manga','ringtone'])}


${cat('🎮 𝙁𝙐𝙉 & 𝙂𝘼𝙈𝙀𝙎', ['rps','trivia','riddle','8ball','dice','coinflip','truth','dare','joke','fact','meme','flirt','pickup','compliment','roast','rizz','advice','lovemeter'])}


${cat('👥 𝙂𝙍𝙊𝙐𝙋', ['add','kick','promote','demote','mute','unmute','tagall','everyone','hidetag','gclink','gcinfo','gcmembers','gcpp','gcname','gcdesc'])}


${cat('👑 𝙊𝙒𝙉𝙀𝙍', ['broadcast','block','unblock','setname','setbio','setpp','restart','eval','setmode','setprefix','settings','setautoread','setonline','setstatusseen','vv','whois'])}


${cat('🎌 𝘼𝙉𝙄𝙈𝙀', ['animelist','ship','lovemeter','waifuim','waifu','neko','hug','slap','kiss','punch','pat'])}


${cat('🎌 𝘼𝙉𝙄𝙈𝙀', ['animelist','ship','lovemeter','waifuim','waifu','neko','hug','slap','kiss','punch','pat'])}

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ* *${config.BOT_NAME}* | *${config.OWNER_NAME}*`;

    await sendBtn(conn, m.from, {
      image: config.MENU_IMAGE,
      body: menuBody,
    }, m);
    await m.React('✅');
    return;
  }

  // ─── SUBMENU HANDLERS ───
  const subKeys = Object.keys(SUBMENUS);
  for (const key of subKeys) {
    const sub = SUBMENUS[key];
    const aliases = [
      `${key} menu`, `${key}menu`, `${key}cmds`, `${key} commands`,
      `menu ${key}`, `${sub.emoji}`,
    ];
    const fullCmd = (body.slice(p.length).trim()).toLowerCase();
    if (aliases.includes(fullCmd) || (cmd === key && (q === 'menu' || q === 'commands' || q === 'cmds'))) {
      await m.React(sub.emoji);
      await sendBtn(conn, m.from, {
        image: config.MENU_IMAGE,
        body: sub.text,
        footer: `${config.BOT_NAME} | Use prefix: ${p}`,
        buttons: [
          ...sub.buttons,
          { text: '🏠 Main Menu', id: `${p}menu` },
        ],
      }, m);
      await m.React('✅');
      return;
    }
  }

  // ─── UPTIME ───
  if (['uptime', 'up', 'runtime'].includes(cmd)) {
    await m.React('⏱️');
    await m.reply(`⏱️ *${config.BOT_NAME} Runtime*\n\n🚀 *Running:* ${formatUptime(Date.now() - BOT_START)}\n📅 *Started:* ${moment(BOT_START).tz('Africa/Nairobi').format('HH:mm DD/MM/YYYY')}\n🕒 *Now:* ${moment().tz('Africa/Nairobi').format('HH:mm DD/MM/YYYY')}\n💾 *RAM:* ${getRam()}`);
    await m.React('✅');
    return;
  }

  // ─── JID ───
  if (['jid', 'getjid', 'myjid', 'id'].includes(cmd)) {
    await m.React('🔍');
    const senderJid = m.sender || m.from;
    const chatJid = m.from;
    let text = `📋 *JID Information*\n\n👤 *Your JID:* \`${senderJid}\`\n💬 *Chat JID:* \`${chatJid}\``;
    if (m.isGroup) {
      text += `\n\n👥 This is a group chat`;
    } else {
      text += `\n\n💬 This is a private chat`;
    }
    text += `\n\n> ${config.BOT_NAME}`;
    await m.reply(text);
    await m.React('✅');
    return;
  }

  // ─── TAG / MENTION ───
  if (['tag', 'mention'].includes(cmd) && !m.isGroup) {
    await m.reply(`❌ This command only works in groups!`);
    return;
  }
};

export default general;
