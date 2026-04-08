/**
 * Bera — Natural Language Command Assistant
 *
 * Usage (no prefix needed):
 *   bera play juice wrld easy to quit
 *   bera what's the weather in Nairobi
 *   bera generate a galaxy with wolves
 *   bera tell me a joke
 *   bera make a sticker from this  ← reply to an image
 *
 * How it works:
 *   1. Detects messages starting with "bera " (no dot prefix needed)
 *   2. Sends the request to AI which maps it to a bot command
 *   3. Overwrites m.body with the mapped command
 *   4. All subsequent plugins in the handler chain pick it up and execute it
 *
 * IMPORTANT: This plugin must be listed FIRST in ALL_PLUGINS in index.js
 */

import config from '../config.cjs';
import axios from 'axios';

const p = config.PREFIX;

// ─── FULL COMMAND CATALOGUE FOR AI ───────────────────────────────────────────
const COMMAND_CATALOGUE = `
MUSIC & VIDEO:
  .play <song name>          — Download & send MP3 audio
  .pv <song name>            — Download & send MP4 video
  .ytmp3 <url or song name>  — YouTube audio download
  .ytmp4 <url or song name>  — YouTube video download
  .spotify <song/url>        — Spotify track download
  .soundcloud <url>          — SoundCloud track
  .lyrics <song name>        — Get song lyrics
  .tiktok <url>              — Download TikTok video
  .instagram <url>           — Download Instagram post
  .twitter <url>             — Download Twitter/X video

AI & IMAGE GENERATION:
  .gpt <question>            — Chat with GPT AI
  .ai <question>             — Chat with AI
  .imagine <prompt>          — Generate AI image from prompt
  .galaxy <theme>            — Generate galaxy/cosmic AI art
  .translate <text> to <lang> — Translate text
  .tts <text>                — Convert text to speech audio

PHOTO EFFECTS (reply to an image):
  .blur                      — Blur effect
  .greyscale                 — Black & white
  .sepia                     — Vintage tone
  .pixelate                  — Pixelate effect
  .invert                    — Invert colors
  .jail                      — Prison bars overlay
  .wasted                    — GTA Wasted screen
  .triggered                 — Triggered meme
  .comrade                   — Soviet flag
  .gay                       — Pride flag filter
  .circle                    — Crop to circle
  .sticker                   — Convert image to sticker

SEARCH & INFO:
  .google <query>            — Google search
  .wikipedia <topic>         — Wikipedia search
  .define <word>             — Dictionary definition
  .news [category]           — Latest news headlines
  .weather <city>            — Current weather
  .movie <title>             — Movie info
  .youtube <query>           — YouTube search
  .github <username>         — GitHub profile
  .npm <package>             — NPM package info

FUN & GAMES:
  .joke                      — Random joke
  .fact                      — Fun fact
  .meme                      — Random meme
  .8ball <question>          — Magic 8-ball answer
  .truth                     — Truth question
  .dare                      — Dare challenge
  .trivia                    — Trivia quiz question
  .riddle                    — A riddle
  .coinflip                  — Flip a coin
  .dice                      — Roll a dice
  .rps                       — Rock paper scissors
  .flirt                     — Flirt line
  .pickup                    — Pickup line
  .compliment                — Compliment
  .roast                     — Roast/insult
  .rizz                      — Rizz line
  .advice                    — Life advice

TOOLS & UTILITIES:
  .calc <expression>         — Calculate math
  .qr <text or url>          — Generate QR code
  .screenshot <url>          — Web page screenshot
  .shortlink <url>           — Shorten URL
  .removebg                  — Remove background (reply to image)
  .currency <amt> <FROM> to <TO> — Currency conversion
  .time <city>               — Current time in a city
  .password <length>         — Generate password
  .encrypt <text>            — Encrypt text
  .carbon <code>             — Code to image

GROUP & BOT INFO:
  .ping                      — Bot speed check
  .alive                     — Bot status
  .uptime                    — How long bot has been running
  .menu                      — Show all commands
  .settings                  — View bot settings
  .gcinfo                    — Group information
  .gcmembers                 — List group members
  .tagall                    — Tag everyone in group
`;

// ─── AI MAPPER ───────────────────────────────────────────────────────────────
async function mapToCommand(request) {
  const systemPrompt = `You are a command parser for a WhatsApp bot named Bera.
Your job is to read a natural language request and return ONLY the matching bot command.

Rules:
- Return ONLY the command, nothing else. No explanation, no punctuation after.
- The command must start with a dot (.)
- If you cannot map it confidently, return: .gpt ${request}
- Keep all arguments from the original request

${COMMAND_CATALOGUE}

User request: "${request}"
Command:`;

  // Try Pollinations AI
  try {
    const res = await axios.post(
      'https://text.pollinations.ai/openai',
      {
        model: 'openai',
        messages: [
          { role: 'system', content: 'You are a bot command parser. Output ONLY the command string starting with a dot. No extra text.' },
          { role: 'user', content: systemPrompt },
        ],
        max_tokens: 80,
        temperature: 0.1,
      },
      { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
    );
    const raw = res.data?.choices?.[0]?.message?.content?.trim() || '';
    return cleanCommand(raw, request);
  } catch (_) {}

  // GET fallback
  try {
    const res = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(systemPrompt)}?model=openai&seed=-1`,
      { timeout: 15000, responseType: 'text' }
    );
    const raw = typeof res.data === 'string' ? res.data.trim() : '';
    return cleanCommand(raw, request);
  } catch (_) {}

  // Hard fallback — just pass to AI chat
  return `${p}gpt ${request}`;
}

function cleanCommand(raw, fallback) {
  if (!raw) return `${p}gpt ${fallback}`;

  // Extract first line that looks like a command
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('.')) {
      // Replace the dot with the configured prefix
      return p + line.slice(1);
    }
  }

  // If no dot found but looks like a command word
  const first = lines[0];
  if (first && !first.includes(' ') === false) {
    return `${p}gpt ${fallback}`;
  }

  return `${p}gpt ${fallback}`;
}

// ─── MAIN PLUGIN ─────────────────────────────────────────────────────────────
const bera = async (m, conn) => {
  if (!m.body) return;

  const body = m.body.trim();

  // Trigger: "bera <anything>" (case insensitive, no dot prefix needed)
  if (!/^bera\s+.+/i.test(body)) return;

  const request = body.replace(/^bera\s+/i, '').trim();
  if (!request) return;

  await m.React('🤖');

  let mappedCmd;
  try {
    mappedCmd = await mapToCommand(request);
  } catch (_) {
    mappedCmd = `${p}gpt ${request}`;
  }

  // Sanitise — must start with prefix
  if (!mappedCmd.startsWith(p)) {
    mappedCmd = `${p}gpt ${request}`;
  }

  console.log(`[BERA] "${request}" → "${mappedCmd}"`);

  // Show the user what command is being run
  const cmdName = mappedCmd.split(' ')[0];
  await conn.sendMessage(m.from, {
    text: `🤖 *Bera understood:* \`${mappedCmd}\`\n⚡ _Executing..._`,
  }).catch(() => {});

  // ── Override m.body so all subsequent plugins execute this command ──────────
  m.body = mappedCmd;
};

export default bera;
