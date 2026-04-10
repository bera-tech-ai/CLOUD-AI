import dotenv from 'dotenv';
dotenv.config();

import {
  makeWASocket,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  getContentType,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Handler, Callupdate } from './data/handler.js';
import { lidMap } from './lib/Serializer.js';
import { ensureYtDlp } from './lib/ytdlp.js';

import express from 'express';
import pino from 'pino';
import fs from 'fs';
import axios from 'axios';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import zlib from 'zlib';
import config from './config.cjs';

// ─── Plugins ───
import generalPlugin from './plugins/general.js';
import aiPlugin from './plugins/ai.js';
import imaginePlugin from './plugins/imagine.js';
import animePlugin from './plugins/anime.js';
import downloaderPlugin from './plugins/downloader.js';
import converterPlugin from './plugins/converter.js';
import toolsPlugin from './plugins/tools.js';
import extraPlugin from './plugins/extra.js';
import groupPlugin from './plugins/group.js';
import ownerPlugin from './plugins/owner.js';
import searchPlugin from './plugins/search.js';
import gamesPlugin from './plugins/games.js';
import settingsPlugin from './plugins/settings.js';
import techPlugin from './plugins/tech.js';
import funPlugin from './plugins/fun.js';
import infoPlugin from './plugins/info.js';
import photoPlugin from './plugins/photo.js';
import beraPlugin from './plugins/bera.js';
import { onGroupUpdate } from './plugins/welcome.js';
import { handleCall } from './plugins/anticall.js';
import btnmenuPlugin from './plugins/btnmenu.js';
import dbaPlugin from './plugins/dba.js';

const ALL_PLUGINS = [
  beraPlugin,   // MUST be first — rewrites m.body before other plugins run
  btnmenuPlugin,
  generalPlugin, aiPlugin, imaginePlugin, animePlugin, photoPlugin,
  downloaderPlugin, converterPlugin, toolsPlugin, extraPlugin,
  groupPlugin, ownerPlugin, searchPlugin, gamesPlugin, settingsPlugin,
  techPlugin, funPlugin, infoPlugin, dbaPlugin,
];

// ─── Setup ───
const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const lime = chalk.bold.hex('#32CD32');
const orange = chalk.bold.hex('#FFA500');
let initialConnection = true;
let reconnectAttempts = 0;
let isConnecting = false;   // guard: one connection attempt at a time
let activeConn = null;      // always points to the current live socket
const msgRetryCounterCache = new NodeCache();
const messageStore = new Map();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

// ─── Suppress Baileys crypto noise ───
const _origLog = console.log, _origErr = console.error, _origWarn = console.warn;
const SUPPRESS = [
  /Closing session/i, /Closing open session/i, /SessionEntry/i, /indexInfo/i,
  /_chains/i, /ephemeralKeyPair/i, /rootKey/i, /baseKey/i, /pendingPreKey/i,
  /currentRatchet/i, /registrationId/i, /Bad MAC/i, /decryptWithSessions/i,
  /verifyMAC/i, /chainKey/i, /chainType/i, /messageKeys/i, /baseKeyType/i,
  /remoteIdentityKey/i, /signedKeyId/i, /preKeyId/i, /privKey/i, /pubKey/i,
  /<Buffer /i, /previousCounter/i,
  /Failed to decrypt/i, /decrypt message with/i, /no matching sessions/i,
  /Error decrypting/i, /SenderKeyMessage/i, /failed to decrypt group/i,
];
function suppress(fn) {
  return (...args) => {
    try {
      const str = args.map(a => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object') {
          if (a._chains || a.currentRatchet || a.indexInfo) return '[SessionEntry]';
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a ?? '');
      }).join(' ');
      if (SUPPRESS.some(p => p.test(str))) return;
    } catch { /* pass through */ }
    fn(...args);
  };
}
console.log   = suppress(_origLog);
console.error = suppress(_origErr);
console.warn  = suppress(_origWarn);

// ─── Simple contacts store ───
const store = { contacts: {} };

// ─── Global crash guard ───
process.on('uncaughtException', (err) => {
  _origLog(chalk.red(`⚠️ Uncaught Exception (handled): ${err.message}`));
});
process.on('unhandledRejection', (reason) => {
  _origLog(chalk.red(`⚠️ Unhandled Rejection (handled): ${reason?.message || reason}`));
});

// ─── Banner ───
_origLog(orange(`
╔══════════════════════════════════╗
║         ℂ𝕃𝕆𝕌𝔻 𝔸𝕀  v3.2          ║
║     by 𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸              ║
╚══════════════════════════════════╝
`));

// ─── Session Loader ───
async function loadSession() {
  try {
    if (fs.existsSync(sessionDir)) {
      fs.readdirSync(sessionDir).forEach(f => {
        try { fs.unlinkSync(path.join(sessionDir, f)); } catch (_) {}
      });
    }

    let sessionId = config.SESSION_ID;
    if (!sessionId || typeof sessionId !== 'string') throw new Error('SESSION_ID missing');

    const [header, b64Check] = sessionId.split('~');
    if (header !== 'Gifted' || !b64Check) throw new Error("Invalid format: need 'Gifted~...'");

    if (!b64Check.startsWith('H4sI')) {
      _origLog(orange(`🔄 Fetching session from Atassa server...`));
      const res = await axios.get(`https://session.giftedtech.co.ke/session/${b64Check}`, { timeout: 15000 });
      const fetched = (res.data || '').toString().trim();
      if (!fetched.startsWith('Gifted~H4sI')) throw new Error('Server returned invalid session');
      sessionId = fetched;
    }

    const [, b64data] = sessionId.split('~');
    const creds = zlib.gunzipSync(Buffer.from(b64data, 'base64'));
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(credsPath, creds, 'utf8');
    _origLog(lime('✅ Session loaded!'));
    return true;
  } catch (err) {
    _origLog(chalk.red('❌ Session error:'), err.message);
    return false;
  }
}

// ─── Connect ───
async function connectToWhatsApp() {
  // Guard: one connection attempt at a time
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (!fs.existsSync(credsPath)) {
      const sid = config.SESSION_ID;
      if (sid && sid !== 'Your_Session_Id') {
        const ok = await loadSession();
        if (!ok) {
          _origLog(chalk.red('❌ Failed to load session. Check SESSION_ID and restart.'));
          process.exit(1);
        }
      } else {
        _origLog(chalk.red('❌ No SESSION_ID configured. Set SESSION_ID and restart.'));
        process.exit(1);
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: state,
      msgRetryCounterCache,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      downloadMediaMessage,
      getMessage: async (key) => {
        const stored = messageStore.get(`${key.remoteJid}:${key.id}`);
        return stored || undefined;
      },
    });

    // Update global ref — global intervals use this to reach the live socket
    activeConn = conn;
    isConnecting = false;

    // ─── Contacts store ───
    conn.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) { if (c.id) store.contacts[c.id] = c; }
    });
    conn.ev.on('contacts.update', (updates) => {
      for (const u of updates) {
        if (u.id) store.contacts[u.id] = { ...(store.contacts[u.id] || {}), ...u };
      }
    });

    // ─── Connection Updates ───
    conn.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        activeConn = null; // clear so global intervals don't fire on dead socket
        const code = lastDisconnect?.error?.output?.statusCode;

        if (code === DisconnectReason.loggedOut || code === 401) {
          _origLog(chalk.yellow('🔄 Session expired/logged out. Clearing and reconnecting...'));
          try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
          try { fs.mkdirSync(sessionDir, { recursive: true }); } catch (_) {}
          reconnectAttempts = 0;
          initialConnection = true;
          setTimeout(() => connectToWhatsApp(), 3000);
        } else if (code === 440) {
          reconnectAttempts++;
          const wait440 = reconnectAttempts <= 3 ? 60000 : Math.min(60000 * reconnectAttempts, 300000);
          _origLog(chalk.yellow(`⚡ Stream conflict (440). Attempt ${reconnectAttempts} — waiting ${Math.round(wait440/1000)}s...`));
          setTimeout(() => connectToWhatsApp(), wait440);
        } else if (code === 408 || code === 503) {
          reconnectAttempts++;
          const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 60000);
          _origLog(chalk.yellow(`🔌 Disconnected (${code}). Attempt ${reconnectAttempts} — retry in ${Math.round(delay/1000)}s...`));
          setTimeout(() => connectToWhatsApp(), delay);
        } else {
          reconnectAttempts++;
          const delay = Math.min(4000 * reconnectAttempts, 30000);
          _origLog(chalk.yellow(`🔌 Disconnected (${code}). Reconnecting in ${Math.round(delay/1000)}s...`));
          setTimeout(() => connectToWhatsApp(), delay);
        }
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        if (initialConnection) {
          initialConnection = false;
          const botNum = conn.user?.id?.split(':')[0];
          _origLog(lime(`\n✅ ${config.BOT_NAME} Connected!`));
          _origLog(lime(`👑 Owner  : ${config.OWNER_NAME} (+${config.OWNER_NUMBER})`));
          _origLog(lime(`📱 Number : ${botNum}`));
          _origLog(lime(`📶 Mode   : ${config.MODE}`));
          _origLog(lime(`🔧 Prefix : ${config.PREFIX}\n`));

          try {
            const selfJid = `${botNum}@s.whatsapp.net`;
            await conn.sendMessage(selfJid, {
              text: `╔══════════════════════╗\n║  *${config.BOT_NAME}* Online ✅  ║\n╚══════════════════════╝\n\n🤖 *Bot:* ${config.BOT_NAME}\n📱 *Number:* ${botNum}\n📶 *Mode:* ${config.MODE}\n👑 *Owner:* ${config.OWNER_NAME}\n🕒 *Time:* ${moment().tz('Africa/Nairobi').format('HH:mm:ss DD/MM/YYYY')}\n\n_Type ${config.PREFIX}menu to see all commands_ 🌩️`,
            });
          } catch (_) {}

          // Resolve owner LID
          try {
            const ownerPhone = config.OWNER_NUMBER + '@s.whatsapp.net';
            const results = await conn.onWhatsApp(config.OWNER_NUMBER);
            const ownerInfo = Array.isArray(results) ? results[0] : results;
            if (ownerInfo?.jid && ownerInfo.jid !== ownerPhone) {
              lidMap.set(ownerInfo.jid, ownerPhone);
              lidMap.set(ownerPhone, ownerInfo.jid);
              _origLog(lime(`🔑 Owner LID resolved: ${ownerInfo.jid} → ${ownerPhone}`));
            }
          } catch (_) {}
        }
      }
    });

    conn.ev.on('creds.update', saveCreds);

    // ─── LID map ───
    const updateLidMap = (items) => {
      for (const c of (Array.isArray(items) ? items : Object.values(items))) {
        const lid = c.lid || c.lidJid;
        const id = c.id || c.jid;
        if (lid && id && !id.endsWith('@lid')) lidMap.set(lid, id);
        if (c.id && !c.id.endsWith('@lid') && c.lidJid) lidMap.set(c.lidJid, c.id);
      }
    };
    conn.ev.on('contacts.upsert', updateLidMap);
    conn.ev.on('contacts.update', updateLidMap);
    conn.ev.on('chats.upsert', updateLidMap);
    conn.ev.on('chats.update', updateLidMap);
    conn.ev.on('messaging-history.set', () => updateLidMap(Object.values(store.contacts || {})));

    // ─── Messages ───
    conn.ev.on('messages.upsert', async ({ messages, type }) => {
      const isInteractiveResponse = (msg) => !!(
        msg.message?.interactiveResponseMessage ||
        msg.message?.viewOnceMessage?.message?.interactiveResponseMessage ||
        msg.message?.buttonsResponseMessage ||
        msg.message?.listResponseMessage ||
        msg.message?.templateButtonReplyMessage
      );
      // 'notify' = normal incoming messages
      // non-notify with interactive = button tap responses (allow those through)
      if (type !== 'notify' && !messages.some(isInteractiveResponse)) return;

      for (let msg of messages) {
        try {
          // ─── Resolve @lid JIDs ───
          const tryResolveLid = (lid) => {
            if (!lid || !lid.endsWith('@lid')) return lid;
            let resolved = lidMap.get(lid);
            if (!resolved) {
              const match = Object.values(store?.contacts || {}).find(c => (c.lid || c.lidJid) === lid);
              if (match?.id) { resolved = match.id; lidMap.set(lid, resolved); }
            }
            return (resolved && !resolved.endsWith('@lid')) ? resolved : lid;
          };

          if (msg.key?.remoteJid?.endsWith('@lid')) {
            const resolved = tryResolveLid(msg.key.remoteJid);
            if (resolved !== msg.key.remoteJid) {
              msg = { ...msg, key: { ...msg.key, remoteJid: resolved } };
            }
          }
          if (msg.key?.participant?.endsWith('@lid')) {
            const resolved = tryResolveLid(msg.key.participant);
            if (resolved !== msg.key.participant) {
              msg = { ...msg, key: { ...msg.key, participant: resolved } };
            }
          }

          // Status
          if (msg.key?.remoteJid === 'status@broadcast') {
            if (config.AUTO_STATUS_SEEN) await conn.readMessages([msg.key]).catch(() => {});
            if (config.AUTO_STATUS_REACT) {
              const emojis = ['❤️', '🔥', '😍', '💯', '👏', '✨', '🌟', '🎉'];
              await conn.sendMessage('status@broadcast',
                { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: msg.key } },
                { statusJidList: [msg.key.participant] }
              ).catch(() => {});
            }
            if (config.AUTO_STATUS_REPLY && config.STATUS_READ_MSG) {
              await conn.sendMessage(msg.key.participant, { text: config.STATUS_READ_MSG }).catch(() => {});
            }
            continue;
          }

          // Store messages (anti-delete + getMessage retry)
          if (msg.message) {
            messageStore.set(`${msg.key.remoteJid}:${msg.key.id}`, msg.message);
            if (config.ANTI_DELETE && !msg.key.fromMe) {
              messageStore.set(msg.key.id, { msg, ts: Date.now() });
            }
            if (messageStore.size > 600) messageStore.delete(messageStore.keys().next().value);
          }

          // Auto read
          if (config.AUTO_READ) await conn.readMessages([msg.key]).catch(() => {});

          // Process message
          await Handler(conn, msg, ALL_PLUGINS);

        } catch (err) {
          _origLog(chalk.red('[MSG ERROR]'), err?.message);
        }
      }
    });

    // ─── Anti-Delete ───
    conn.ev.on('messages.delete', async (item) => {
      if (!config.ANTI_DELETE) return;
      try {
        const keys = item.keys || [];
        for (const key of keys) {
          const stored = messageStore.get(key.id);
          if (!stored) continue;
          const { msg } = stored;
          const msgType = getContentType(msg.message);
          const target = config.DELETE_PATH === 'pm'
            ? `${config.OWNER_NUMBER}@s.whatsapp.net`
            : msg.key.remoteJid;
          const deleter = key.participant || msg.key.remoteJid;

          await conn.sendMessage(target, {
            text: `🗑️ *Anti-Delete Alert!*\n\n👤 *From:* @${deleter.split('@')[0]}\n💬 *Chat:* ${msg.key.remoteJid}\n📄 *Type:* ${msgType}\n🕒 *Time:* ${moment().tz('Africa/Nairobi').format('HH:mm:ss')}`,
            mentions: [deleter],
          }).catch(() => {});

          if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            if (text) await conn.sendMessage(target, { text: `📝 *Deleted Message:*\n${text}` }).catch(() => {});
          } else if (msgType === 'imageMessage') {
            try {
              const buf = await downloadMediaMessage(msg, 'buffer', {});
              await conn.sendMessage(target, { image: buf, caption: '📸 *Deleted Image*' });
            } catch {}
          } else if (msgType === 'videoMessage') {
            try {
              const buf = await downloadMediaMessage(msg, 'buffer', {});
              await conn.sendMessage(target, { video: buf, caption: '🎬 *Deleted Video*' });
            } catch {}
          }
          messageStore.delete(key.id);
        }
      } catch (err) {
        _origLog('[ANTIDELETE ERROR]', err?.message);
      }
    });

    // ─── Calls ───
    conn.ev.on('call', (call) => handleCall(conn, call));

    // ─── Group Events ───
    conn.ev.on('group-participants.update', async (update) => {
      try { await onGroupUpdate(conn, update); } catch {}
    });

  } catch (err) {
    isConnecting = false;
    _origLog(chalk.red('[CONNECT ERROR]'), err?.message);
    reconnectAttempts++;
    setTimeout(() => connectToWhatsApp(), Math.min(4000 * reconnectAttempts, 30000));
  }
}

// ─── Keep-Alive Server ───
app.get('/', (req, res) => res.json({
  status: 'online',
  bot: config.BOT_NAME,
  owner: config.OWNER_NAME,
  uptime: Math.floor(process.uptime()) + 's',
  prefix: config.PREFIX,
  mode: config.MODE,
  time: moment().tz('Africa/Nairobi').format('HH:mm:ss DD/MM/YYYY'),
}));
app.listen(PORT, () => _origLog(lime(`🌐 Keep-alive server: port ${PORT}`)));

// ─── GLOBAL SINGLETON INTERVALS ─────────────────────────────────────────────
// Created ONCE here, NEVER inside connectToWhatsApp().
// activeConn is updated each time a new socket is created.
// When conn is closed, activeConn is set to null so intervals are silent.

// Always-online presence — 60s (not 30s, to reduce WA pressure)
setInterval(() => {
  if (activeConn && config.ALWAYS_ONLINE) {
    activeConn.sendPresenceUpdate('available').catch(() => {});
  }
}, 60000);

// Heartbeat — prevents BeraHost 20-min idle kill
setInterval(() => {
  const up = Math.floor(process.uptime());
  const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = up % 60;
  const st = activeConn ? '🟢 connected' : '🔴 reconnecting';
  _origLog(lime(`💓 ${h}h${m}m${s}s | ${st} | store:${messageStore.size}`));
}, 10 * 60 * 1000);

// ─── Start ───
// Ensure yt-dlp binary exists before connecting (downloads automatically if missing)
ensureYtDlp()
  .then(() => connectToWhatsApp())
  .catch((err) => {
    _origLog(chalk.yellow(`⚠️ yt-dlp unavailable: ${err.message} — download commands may be limited`));
    connectToWhatsApp();
  });
