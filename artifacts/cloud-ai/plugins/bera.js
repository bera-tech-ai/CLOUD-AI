/**
 * Bera — Advanced Natural Language AI Command Assistant
 *
 * Trigger: type  bera <anything>  (no dot prefix needed)
 * Type just "bera" alone to get a greeting.
 *
 * Features:
 *  - Understands plain English, Kenyan Sheng, Swahili slang
 *  - Maps to ANY bot command including vv, anticall, settings, etc.
 *  - Knows Bruce Bera is the developer
 *  - Shows a discreet "Executing your command, sir" instead of revealing the command
 *  - MUST be first in ALL_PLUGINS (rewrites m.body before other plugins run)
 */

import config from '../config.cjs';
import axios from 'axios';

const p = config.PREFIX;

// ─── GREETINGS (when user just types "bera" alone) ───────────────────────────
const GREETINGS = [
  `Sawa boss, niambie nifanye nini? 🫡`,
  `Karibu! Niambie command unataka, sir. 🤖`,
  `Ndio boss, toa order yako. ✅`,
  `Ready! Nikusaidie nini leo? 🙌`,
  `Simama hapa — niambie unataka nifanye nini, sir. 🫡`,
  `Niambie tu, nitafanya. Niko tayari! ⚡`,
  `Speak to me, boss. Nifanye nini? 🤖`,
];

function randomGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

// ─── FULL COMMAND CATALOGUE ───────────────────────────────────────────────────
const COMMAND_CATALOGUE = `
=== MUSIC & DOWNLOADERS ===
.play <song name>              → Search YouTube, download and send MP3 audio
.pv <song name>                → Search YouTube, download and send MP4 video
.ytmp3 <url or song name>      → YouTube to MP3
.ytmp4 <url or song name>      → YouTube to MP4
.spotify <song or url>         → Spotify track download
.soundcloud <url>              → SoundCloud download
.tiktok <url>                  → TikTok video (no watermark)
.instagram <url>               → Instagram post/reel download
.twitter <url>                 → Twitter/X media download
.facebook <url>                → Facebook video download
.pinterest <url>               → Pinterest image
.capcut <url>                  → CapCut video
.mediafire <url>               → MediaFire file
.terabox <url>                 → TeraBox file
.gdrive <url>                  → Google Drive file
.aio <url>                     → Auto-detect platform and download
.gitclone <repo url>           → Clone GitHub repo

=== AI CHAT ===
.ai <question>                 → Chat with CLOUD AI
.gpt <question>                → Chat with GPT-3.5
.gpt4 <question>               → Chat with GPT-4
.gpt4o <question>              → Chat with GPT-4o
.gemini <question>             → Chat with Google Gemini
.claude <question>             → Chat with Claude AI
.llama <question>              → Chat with LLaMA
.deepseek <question>           → Chat with DeepSeek
.mistral <question>            → Chat with Mistral
.qwen <question>               → Chat with Qwen
.grok <question>               → Chat with Grok
.venice <question>             → Chat with Venice AI
.openai <question>             → Chat with OpenAI
.translate <text> to <language> → Translate text
.lang <text>                   → Detect what language a text is in
.tts <text>                    → Convert text to voice/speech audio

=== IMAGE GENERATION ===
.imagine <prompt>              → Generate AI image (FLUX model)
.flux <prompt>                 → FLUX Dev image generation
.dalle <prompt>                → DALL-E image generation
.sdxl <prompt>                 → Stable Diffusion XL image
.pixart <prompt>               → PixArt image generation
.galaxy <theme>                → Galaxy / cosmic nebula AI art
.cosmic <theme>                → Cosmic space AI art
.nebula <theme>                → Nebula AI art

=== PHOTO EFFECTS (reply to an image or tag a user) ===
.blur                          → Blur the image
.greyscale                     → Make it black and white
.invert                        → Invert the colors
.sepia                         → Vintage sepia tone
.pixelate                      → Pixelate / mosaic effect
.mirror                        → Mirror horizontally
.flip                          → Flip upside down
.brighten                      → Brighten the image
.darken                        → Darken the image
.jail                          → Put prison bars on image
.wasted                        → GTA Wasted screen overlay
.triggered                     → Triggered meme overlay
.glass                         → Broken glass overlay
.comrade                       → Soviet flag overlay
.gay                           → Pride rainbow flag filter
.circle                        → Crop image into a circle
.simpcard                      → Generate a simp card
.horny                         → Generate a horny card
.lolice                        → Lolice arrest card

=== CONVERTER ===
.sticker                       → Convert image/video to sticker (reply to media)
.toimg                         → Convert sticker to image (reply to sticker)
.toaudio                       → Extract audio from video (reply to video)
.toptt                         → Convert audio to voice note (reply to audio)
.vv                            → Open / reveal a view-once message (reply to view-once)
.base64 <text>                 → Encode or decode base64
.binary <text>                 → Text to binary code
.hex <text>                    → Text to hexadecimal
.morse <text>                  → Text to morse code
.reverse <text>                → Reverse the text
.tourl                         → Upload media and get a URL (reply to media)

=== TOOLS & UTILITIES ===
.weather <city>                → Current weather for a city
.lyrics <song name>            → Song lyrics
.qr <text or url>              → Generate QR code
.screenshot <url>              → Take a screenshot of a website
.removebg                      → Remove background from image (reply to image)
.tts <text>                    → Text to speech
.shortlink <url>               → Shorten a URL
.stalk <number>                → Get WhatsApp info for a number
.pp <number>                   → Get profile picture of a number
.getbio <number>               → Get WhatsApp bio/status of a number
.carbon <code>                 → Generate a code-to-image (carbon)
.password <length>             → Generate a secure random password
.encrypt <text>                → Encrypt text
.decrypt <text>                → Decrypt text
.time <city>                   → Current time in a city
.fetch <url>                   → Fetch/read content from a URL
.domain <domain name>          → Domain WHOIS lookup

=== TECH TOOLS ===
.iplookup <ip>                 → IP address lookup / geolocation
.dns <domain>                  → DNS lookup
.hash <text>                   → Generate MD5/SHA hash
.uuid                          → Generate a random UUID
.timestamp                     → Current Unix timestamp
.httpcode <code>               → Explain an HTTP status code
.jsonfmt <json>                → Format/beautify JSON
.urlencode <text>              → URL-encode text
.urldecode <text>              → URL-decode text
.subnet <cidr>                 → Subnet/CIDR calculator
.calc <expression>             → Calculate a math expression

=== SEARCH ===
.google <query>                → Google search
.youtube <query>               → YouTube search
.wikipedia <topic>             → Wikipedia search
.define <word>                 → Dictionary definition
.github <username>             → GitHub user profile
.npm <package>                 → NPM package info
.movie <title>                 → Movie / IMDB info
.anime <title>                 → Anime info
.manga <title>                 → Manga info
.ringtone <song>               → Search for a ringtone

=== INFO & LOOKUP ===
.currency <amount> <FROM> to <TO> → Currency conversion e.g. .currency 100 USD to KES
.country <name>                → Country information
.pokedex <pokemon name>        → Pokémon info
.horoscope <zodiac sign>       → Daily horoscope
.news [category]               → Latest news headlines
.bible                         → Daily Bible verse
.npm <package>                 → NPM info

=== FUN & GAMES ===
.joke                          → Random joke
.fact                          → Fun fact
.meme                          → Random meme image
.8ball <question>              → Magic 8-ball
.truth                         → Truth question
.dare                          → Dare challenge
.trivia                        → Trivia quiz
.riddle                        → A riddle
.coinflip                      → Flip a coin
.dice                          → Roll a dice
.rps                           → Rock paper scissors
.flirt                         → Flirt line
.pickup                        → Pickup line
.compliment                    → Compliment someone
.roast                         → Roast / insult someone
.rizz                          → Rizz line
.advice                        → Life advice
.lovemeter                     → Love percentage meter

=== ANIME ===
.animelist                     → Show anime commands
.waifu                         → Random waifu image
.neko                          → Random neko image
.hug                           → Send a hug GIF
.slap                          → Send a slap GIF
.kiss                          → Send a kiss GIF
.punch                         → Send a punch GIF
.pat                           → Send a pat GIF
.ship @user                    → Ship two users / love meter
.waifuim                       → Waifu.im random image

=== GROUP MANAGEMENT ===
.add <number>                  → Add a member to the group
.kick @user                    → Remove a member from the group
.promote @user                 → Make someone an admin
.demote @user                  → Remove admin rights
.mute                          → Mute/lock the group
.unmute                        → Unmute/unlock the group
.tagall                        → Tag all members in the group
.hidetag <message>             → Silent tag all (ghost tag)
.gclink                        → Get group invite link
.gcinfo                        → Group information
.gcmembers                     → List all group members
.gcpp                          → Group profile picture
.setgcname <name>              → Change group name
.setgcdesc <description>       → Change group description
.antilink on/off               → Enable/disable anti-link filter
.gcleave                       → Bot leaves the group

=== BOT SETTINGS (owner only) ===
.settings                      → Show all current bot settings
.setmode public                → Allow all users to use bot
.setmode private               → Owner-only mode
.setprefix <character>         → Change the command prefix
.anticall on/off               → Reject incoming calls automatically
.autotyping on/off             → Show typing indicator
.antidelete on/off             → Log deleted messages
.autoreact on/off              → Auto-react to messages
.autoread on/off               → Auto-read messages
.setonline on/off              → Always appear online
.statusseen on/off             → Auto-view WhatsApp statuses

=== OWNER COMMANDS ===
.broadcast <message>           → Broadcast to all chats
.block @user                   → Block a user
.unblock <number>              → Unblock a user
.setname <name>                → Change bot display name
.setbio <text>                 → Change bot bio/status
.setpp                         → Change bot profile picture (reply to image)
.restart                       → Restart the bot
.eval <js code>                → Execute JavaScript code
.report <message>              → Send a bug report to dev

=== BOT INFO ===
.ping                          → Check bot response speed
.alive                         → Bot status and uptime info
.uptime                        → How long bot has been running
.menu                          → Show all commands
.info                          → Bot information
.jid                           → Your WhatsApp JID
.owner                         → Bot owner contact
`;

// ─── SYSTEM IDENTITY ──────────────────────────────────────────────────────────
const SYSTEM_IDENTITY = `
You are Bera, an intelligent AI assistant built into a WhatsApp bot called CLOUD-AI.
Your developer and creator is Bruce Bera (also known as Bera, Boss, or Mkubwa).
You are loyal, respectful, and always address the user as "sir", "boss", or "mkubwa".

You understand:
- Standard English
- Kenyan Sheng (street slang): e.g. "piga" = do/hit, "cheza" = play, "nipigie" = play for me,
  "niambie" = tell me, "fanya" = do/make, "weka" = set/put, "toa" = give/send, "peleka" = send,
  "nionyeshe" = show me, "manenos" = things/stuff, "sawa" = okay, "maze" = wow/dude,
  "msee" = guy/dude, "noma" = cool/good, "ingia" = start/go in, "kata" = stop/cut,
  "simama" = stop/hold on, "enda" = go, "haraka" = fast, "polepole" = slow/easy,
  "poa" = cool/fine, "mbaya" = bad, "ngori" = difficult, "freshi" = fresh/new
- Swahili: "piga muziki" = play music, "picha" = photo/image, "habari" = news,
  "hali ya hewa" = weather, "tafsiri" = translate, "mchezo" = game/play,
  "neno" = word/define, "muda" = time, "jibu" = answer
- Common Kenyan expressions mixed with English (code-switching)

Your ONLY job is to map the user's request to ONE bot command from the catalogue.
`;

// ─── AI MAPPER ───────────────────────────────────────────────────────────────
async function mapToCommand(request) {
  const fullPrompt = `${SYSTEM_IDENTITY}

COMMAND CATALOGUE:
${COMMAND_CATALOGUE}

IMPORTANT RULES:
1. Output ONLY the command string starting with a dot (.) — nothing else
2. Include all relevant arguments from the user's request
3. For questions or general chat with no clear command match → use .gpt <question>
4. If user says "piga muziki X" or "cheza X" or "play X" → .play X
5. If user wants to open a view once / hidden message → .vv
6. If user says "nionyeshe picha yangu na blur" → .blur
7. If user asks about weather "hali ya hewa Nairobi" → .weather Nairobi
8. If user says "translate X to French" or "tafsiri X kwa French" → .translate X to French
9. Keep the original arguments (song names, queries, etc.) exactly as stated

User request: "${request}"
Command (start with dot):`;

  // POST method — most reliable
  try {
    const res = await axios.post(
      'https://text.pollinations.ai/openai',
      {
        model: 'openai',
        messages: [
          {
            role: 'system',
            content: 'You are a WhatsApp bot command parser. You understand English, Kenyan Sheng, and Swahili. Output ONLY the bot command starting with a dot (.) — no explanation, no extra words.',
          },
          { role: 'user', content: fullPrompt },
        ],
        max_tokens: 100,
        temperature: 0.05,
      },
      { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
    );
    const raw = res.data?.choices?.[0]?.message?.content?.trim() || '';
    return extractCommand(raw, request);
  } catch (_) {}

  // GET fallback
  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=openai&seed=-1`,
      { timeout: 15000, responseType: 'text' }
    );
    const raw = typeof res.data === 'string' ? res.data.trim() : '';
    return extractCommand(raw, request);
  } catch (_) {}

  // Hard fallback
  return `${p}gpt ${request}`;
}

function extractCommand(raw, fallback) {
  if (!raw) return `${p}gpt ${fallback}`;

  // Find first line starting with a dot
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('.')) {
      const cmd = line.replace(/[*_`]+/g, '').trim();
      // Replace the dot prefix with the configured bot prefix
      return p + cmd.slice(1);
    }
  }

  // Maybe AI returned just the command word without a dot
  const first = lines[0];
  if (first && /^[a-z0-9]+/i.test(first)) {
    return `${p}gpt ${fallback}`;
  }

  return `${p}gpt ${fallback}`;
}

// ─── EXECUTE RESPONSES (discreet, no command reveal) ─────────────────────────
const EXEC_MESSAGES = [
  `Executing your command, sir 🫡`,
  `On it, boss ⚡`,
  `Sawa mkubwa, inakuja... 🙌`,
  `Ndio sir, nakufanyia sasa hivi 🤖`,
  `Roger that, boss 🫡`,
  `Iko sawa, nakushughulikia ⚡`,
  `Command received, sir ✅`,
  `Fanya! Nakushughulikia hii sasa 🔥`,
];

function randomExec() {
  return EXEC_MESSAGES[Math.floor(Math.random() * EXEC_MESSAGES.length)];
}

// ─── MAIN PLUGIN ─────────────────────────────────────────────────────────────
const bera = async (m, conn) => {
  if (!m.body) return;

  const body = m.body.trim();

  // ─── "bera" alone → friendly greeting ────────────────────────────────────
  if (/^bera\.?$/i.test(body)) {
    await m.React('🤖');
    const name = m.pushName ? `, ${m.pushName.split(' ')[0]}` : '';
    await conn.sendMessage(m.from, {
      text: [
        `🤖 *Bera AI Assistant*`,
        ``,
        `Mambo${name}! Niambie nifanye nini, sir. 🫡`,
        ``,
        `*Mfano wa commands:*`,
        `• _bera play faded alan walker_`,
        `• _bera what's the weather in Nairobi_`,
        `• _bera generate a galaxy with wolves_`,
        `• _bera nipigie joke_`,
        `• _bera translate hello to swahili_`,
        `• _bera open this view once_ ← reply to view-once`,
        `• _bera make sticker_ ← reply to image`,
        ``,
        `_Ninaelewa English, Sheng na Swahili_ 😎`,
        ``,
        `> ${config.BOT_NAME} | Dev: Bruce Bera`,
      ].join('\n'),
    }).catch(() => {});
    await m.React('✅');
    return;
  }

  // ─── "bera <request>" → map and execute ──────────────────────────────────
  if (!/^bera\s+.+/i.test(body)) return;

  const request = body.replace(/^bera\s+/i, '').trim();
  if (!request) return;

  await m.React('⚡');

  let mappedCmd;
  try {
    mappedCmd = await mapToCommand(request);
  } catch (_) {
    mappedCmd = `${p}gpt ${request}`;
  }

  // Sanitise
  if (!mappedCmd || !mappedCmd.startsWith(p)) {
    mappedCmd = `${p}gpt ${request}`;
  }

  console.log(`[BERA] "${request}" → "${mappedCmd}"`);

  // Send discreet execution message (no command reveal)
  await conn.sendMessage(m.from, {
    text: randomExec(),
  }).catch(() => {});

  // Override m.body — all subsequent plugins will see this command
  m.body = mappedCmd;
};

export default bera;
