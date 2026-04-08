/**
 * Button Menu Plugin
 * Handles button-triggered commands — when a user taps a button, Baileys
 * delivers the button's id as the message body. This plugin intercepts those
 * and routes them to the correct command handler.
 *
 * Also intercepts plain-text shortcut commands that act like button presses
 * (e.g. typing ".ping" fires the same logic as pressing the Ping button).
 */

import config from '../config.cjs';
import { sendBtn } from '../lib/sendBtn.js';

const p = config.PREFIX;

// ─── Quick-access command list (shown as tappable buttons) ───────────────────
// Each entry: { label, cmd, description }
// Only commands that need no extra arguments are listed here.
const BUTTON_CMDS = [
  { label: '⚡ Ping',        cmd: 'ping',    desc: 'Bot response speed' },
  { label: '🤖 Alive',       cmd: 'alive',   desc: 'Bot status check' },
  { label: '⏱️ Uptime',      cmd: 'uptime',  desc: 'How long bot has been running' },
  { label: '📋 Menu',        cmd: 'menu',    desc: 'Full command list' },
  { label: 'ℹ️ Info',        cmd: 'info',    desc: 'Bot info & credits' },
  { label: '🔍 JID',         cmd: 'jid',     desc: 'Your WhatsApp JID' },
  { label: '⚙️ Settings',    cmd: 'settings', desc: 'Current bot settings' },
  { label: '🤖 AI Menu',     cmd: 'ai menu', desc: 'AI & image commands' },
  { label: '📥 DL Menu',     cmd: 'dl menu', desc: 'Downloader commands' },
  { label: '🔄 Convert',     cmd: 'convert menu', desc: 'Converter commands' },
  { label: '🛠️ Tools',       cmd: 'tools menu', desc: 'Utility tools' },
  { label: '🎮 Games',       cmd: 'games menu', desc: 'Fun & games' },
  { label: '🌍 Info',        cmd: 'info menu', desc: 'Info & lookup commands' },
  { label: '👥 Group',       cmd: 'group menu', desc: 'Group management' },
];

// Commands that accept a query argument (shown with placeholder)
const QUERY_BUTTON_CMDS = [
  { label: '🎵 Play Audio',  cmd: 'playaudio', placeholder: '<song name>', desc: 'Download YouTube audio' },
  { label: '🎬 Play Video',  cmd: 'playvideo', placeholder: '<song name>', desc: 'Download YouTube video' },
  { label: '🤖 Ask AI',      cmd: 'gpt',       placeholder: '<question>',  desc: 'Chat with GPT' },
  { label: '🎨 Imagine',     cmd: 'imagine',   placeholder: '<prompt>',    desc: 'Generate AI image' },
  { label: '🌤️ Weather',     cmd: 'weather',   placeholder: '<city>',      desc: 'Weather info' },
  { label: '🎵 Spotify',     cmd: 'spotify',   placeholder: '<song>',      desc: 'Download Spotify track' },
];

const btnmenu = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();

  // ─── Handle .btnmenu / .buttons / .quickmenu ───────────────────────────
  if (body.startsWith(p)) {
    const args = body.slice(p.length).trim().split(/\s+/);
    const cmd  = args[0].toLowerCase();

    if (['btnmenu', 'buttons', 'quickmenu', 'btnlist', 'bm'].includes(cmd)) {
      await m.React('🎛️');

      const btnText = [
        `╔═══════════════════════════╗`,
        `║  🎛️  *BUTTON MENU*          ║`,
        `╚═══════════════════════════╝`,
        '',
        `*Tap any button below to run it instantly*`,
        `_(No need to type the full command!)_`,
        '',
        `*⚡ Quick Actions:*`,
        ...BUTTON_CMDS.map(b => `  ┣ ${b.label}`),
        '',
        `*📥 Needs a query (type after tapping):*`,
        ...QUERY_BUTTON_CMDS.map(b => `  ┣ ${b.label} — ${b.placeholder}`),
        '',
        `> ${config.BOT_NAME}`,
      ].join('\n');

      const allButtons = [
        ...BUTTON_CMDS.map(b => ({ text: b.label, id: `${p}${b.cmd}` })),
        ...QUERY_BUTTON_CMDS.map(b => ({ text: b.label, id: `${p}${b.cmd} ` })),
      ];

      await sendBtn(conn, m.from, {
        image: config.MENU_IMAGE,
        body: btnText,
        footer: `${config.BOT_NAME} | Prefix: ${p}`,
        buttons: allButtons,
      }, m);

      await m.React('✅');
      return;
    }

    // ─── .playoption — shows the audio/video choice for .play ─────────────
    if (['playoption', 'playopt', 'po'].includes(cmd)) {
      const q = args.slice(1).join(' ');
      if (!q) return m.reply(`❌ Usage: ${p}playoption <song name>\nThis shows the audio/video choice.\n\n> ${config.BOT_NAME}`);

      await m.React('🎵');
      const optText = [
        `🎵 *Play: "${q}"*`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `Choose your format:`,
        `┣ 🎵 Audio — Download as MP3`,
        `┣ 🎬 Video — Download as MP4`,
        ``,
        `> ${config.BOT_NAME}`,
      ].join('\n');

      await sendBtn(conn, m.from, {
        body: optText,
        footer: `${config.BOT_NAME}`,
        buttons: [
          { text: '🎵 Audio (MP3)', id: `${p}playaudio ${q}` },
          { text: '🎬 Video (MP4)', id: `${p}playvideo ${q}` },
        ],
      }, m);

      await m.React('✅');
      return;
    }
  }
};

export default btnmenu;
