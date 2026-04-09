/**
 * BERA AI — Conversational AI assistant with live access to the bot's database/settings.
 * Commands: .beraai, .bai, .botai, .assistant
 *
 * The AI understands natural language and can:
 *  - Answer questions about bot settings and status
 *  - Update settings (mode, prefix, name, toggles)
 *  - Run bot actions just by being told naturally
 *  - Respond to general questions like a normal AI
 */
import config from '../config.cjs';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

const p = config.PREFIX;

// ─── Read bot's live state ────────────────────────────────────────────────────
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// ─── Write a key to state.json ───────────────────────────────────────────────
function writeState(key, value) {
  const state = readState();
  state[key] = value;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  config.setState?.(state);
}

// ─── Build live bot context snapshot ────────────────────────────────────────
function buildContext() {
  const state = readState();
  return {
    bot_name:        config.BOT_NAME  || state.BOT_NAME  || 'CLOUD AI',
    prefix:          config.PREFIX    || state.PREFIX     || '.',
    mode:            config.MODE      || state.MODE       || 'public',
    owner:           config.OWNER_NUMBER || '254743982206',
    owner_name:      config.OWNER_NAME  || 'Bruce Bera',
    version:         config.VERSION   || '3.2',
    auto_read:       config.AUTO_READ ?? state.AUTO_READ ?? false,
    auto_react:      config.AUTO_REACT ?? state.AUTO_REACT ?? false,
    auto_typing:     config.AUTO_TYPING ?? state.AUTO_TYPING ?? false,
    always_online:   config.ALWAYS_ONLINE ?? state.ALWAYS_ONLINE ?? false,
    anti_delete:     config.ANTI_DELETE ?? state.ANTI_DELETE ?? false,
    auto_status_seen:config.AUTO_STATUS_SEEN ?? state.AUTO_STATUS_SEEN ?? false,
    reject_call:     config.REJECT_CALL ?? state.REJECT_CALL ?? false,
    platform:        'BeraHost',
  };
}

// ─── Call Pollinations AI with bot-aware system prompt ───────────────────────
async function callBotAI(userMessage, ctx) {
  const systemPrompt = `You are BERA AI — the intelligent admin assistant for the CLOUD AI WhatsApp bot.

CURRENT BOT STATE (live database):
${JSON.stringify(ctx, null, 2)}

AVAILABLE ACTIONS you can perform (include in your reply as JSON if needed):
- Change mode:       {"action":"set_mode","value":"public|private|group"}
- Change prefix:     {"action":"set_prefix","value":"."}
- Change bot name:   {"action":"set_botname","value":"NEW NAME"}
- Toggle setting:    {"action":"toggle","key":"auto_read|auto_react|auto_typing|always_online|anti_delete|auto_status_seen|reject_call","value":true|false}
- Get full settings: {"action":"get_settings"}
- No action:         {"action":"none"}

RULES:
1. Reply naturally and conversationally, like a helpful AI assistant.
2. If the user wants to change something, include the JSON action block at the END of your reply on its own line, wrapped in triple backticks like: \`\`\`json\n{...}\n\`\`\`
3. If just answering a question (no change needed), omit the JSON block.
4. Be concise. Max 600 characters unless a detailed answer is needed.
5. You know everything about this bot — its settings, its owner, its capabilities.
6. Address the user warmly. You were built by Bruce Bera.`;

  const res = await axios.post(
    'https://text.pollinations.ai/openai',
    {
      model: 'openai-large',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.7,
    },
    { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
  );
  return res.data?.choices?.[0]?.message?.content?.trim() || null;
}

// ─── Parse action JSON from AI reply ────────────────────────────────────────
function parseAction(reply) {
  const match = reply.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// ─── Execute the action returned by the AI ──────────────────────────────────
async function executeAction(action, m, conn) {
  if (!action || action.action === 'none') return null;

  switch (action.action) {
    case 'set_mode': {
      const valid = ['public', 'private', 'group'];
      const val = (action.value || '').toLowerCase();
      if (!valid.includes(val)) return `⚠️ Invalid mode. Use: public, private, or group.`;
      writeState('MODE', val);
      config.MODE = val;
      return `✅ Bot mode changed to *${val}*`;
    }
    case 'set_prefix': {
      const val = (action.value || '').slice(0, 3);
      if (!val) return `⚠️ No prefix provided.`;
      writeState('PREFIX', val);
      config.PREFIX = val;
      return `✅ Prefix changed to *${val}*`;
    }
    case 'set_botname': {
      const val = (action.value || '').slice(0, 50);
      if (!val) return `⚠️ No name provided.`;
      writeState('BOT_NAME', val);
      config.BOT_NAME = val;
      return `✅ Bot name changed to *${val}*`;
    }
    case 'toggle': {
      const key = action.key?.toUpperCase();
      const value = action.value === true || action.value === 'true';
      if (!key) return `⚠️ No setting key provided.`;
      writeState(key, value);
      config[key] = value;
      return `✅ *${key}* set to *${value}*`;
    }
    case 'get_settings': {
      const ctx = buildContext();
      return `📊 *Current Bot Settings*\n${'━'.repeat(22)}\n${Object.entries(ctx).map(([k,v]) => `• *${k}:* ${v}`).join('\n')}`;
    }
    default:
      return null;
  }
}

// ─── Per-user conversation memory (last 6 turns) ─────────────────────────────
const memory = new Map();
function getMemory(jid) {
  return memory.get(jid) || [];
}
function addMemory(jid, role, content) {
  const hist = getMemory(jid);
  hist.push({ role, content });
  if (hist.length > 6) hist.shift();
  memory.set(jid, hist);
}

// ─── Plugin ──────────────────────────────────────────────────────────────────
const dba = async (m, conn) => {
  if (!m.body) return;
  const body = m.body.trim();
  if (!body.startsWith(p)) return;
  const args = body.slice(p.length).trim().split(/\s+/);
  const cmd  = args[0].toLowerCase();
  const q    = args.slice(1).join(' ');
  const quoted = { quoted: { key: m.key, message: m.message } };

  if (!['beraai', 'bai', 'botai', 'assistant', 'admin'].includes(cmd)) return;

  if (!q) return m.reply(
`🤖 *BERA AI — Bot Assistant*
${'━'.repeat(22)}

I have live access to the bot's database and settings.
Ask me anything or tell me to change something!

*Examples:*
• ${p}beraai What is the current bot mode?
• ${p}beraai Change the mode to private
• ${p}beraai Set prefix to !
• ${p}beraai Turn on auto read
• ${p}beraai Show me all bot settings
• ${p}beraai What version is the bot?
• ${p}beraai Enable reject call mode

> ${config.BOT_NAME}`);

  // Owner only for actions that change settings
  const isOwner = m.sender?.includes(config.OWNER_NUMBER || '254743982206');

  await m.React('🤖');
  const typing = await conn.sendMessage(m.from, { text: `🤖 _BERA AI is thinking..._` }, quoted);

  try {
    const ctx = buildContext();
    addMemory(m.sender, 'user', q);
    const reply = await callBotAI(q, ctx);

    if (!reply) throw new Error('No response from AI');

    // Strip the JSON block from the display text
    const displayText = reply.replace(/```json[\s\S]*?```/g, '').trim();
    const action = parseAction(reply);

    await conn.sendMessage(m.from, { delete: typing.key }).catch(() => null);

    let actionResult = null;
    if (action && action.action !== 'none' && action.action !== 'get_settings') {
      if (!isOwner) {
        actionResult = `⚠️ Only the bot owner can change settings.`;
      } else {
        actionResult = await executeAction(action, m, conn);
      }
    } else if (action?.action === 'get_settings') {
      actionResult = await executeAction(action, m, conn);
    }

    const finalReply = [
      `🤖 *BERA AI*`,
      `${'━'.repeat(22)}`,
      ``,
      displayText || reply,
      actionResult ? `\n${'━'.repeat(22)}\n${actionResult}` : ``,
      ``,
      `> ${config.BOT_NAME}`,
    ].filter(l => l !== null).join('\n');

    await m.reply(finalReply);
    addMemory(m.sender, 'assistant', displayText);
    await m.React('✅');
  } catch (err) {
    await conn.sendMessage(m.from, { delete: typing?.key }).catch(() => null);
    await m.React('❌');
    await m.reply(`❌ *BERA AI Error*\n\n${err.message}\n\nTry again in a moment.\n\n> ${config.BOT_NAME}`);
  }
};

export default dba;
