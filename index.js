import dotenv from 'dotenv';
dotenv.config();

import {
  makeWASocket,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  getContentType,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import { Handler, Callupdate } from './data/handler.js';
import { lidMap } from './lib/Serializer.js';
import { ensureYtDlp } from './lib/ytdlp.js';

import express from 'express';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import readline from 'readline';
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
let isConnecting = false;
let activeConn = null;
let sessionCorrupted = false;

const msgRetryCounterCache = new NodeCache();
const messageStore = new Map();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const sessionDir = path.join(__dirname, 'session');
const phoneFile = path.join(sessionDir, '.phone');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// ─── Suppress Baileys crypto noise ───
const _origLog = console.log;
const _origErr = console.error;
const _origWarn = console.warn;

const SUPPRESS = [
  /Closing session/i,
  /Closing open session/i,
  /SessionEntry/i,
  /indexInfo/i,
  /_chains/i,
  /ephemeralKeyPair/i,
  /rootKey/i,
  /baseKey/i,
  /pendingPreKey/i,
  /currentRatchet/i,
  /registrationId/i,
  /Bad MAC/i,
  /decryptWithSessions/i,
  /verifyMAC/i,
  /chainKey/i,
  /chainType/i,
  /messageKeys/i,
  /baseKeyType/i,
  /remoteIdentityKey/i,
  /signedKeyId/i,
  /preKeyId/i,
  /privKey/i,
  /pubKey/i,
  /<Buffer /i,
  /previousCounter/i,
  /Failed to decrypt/i,
  /decrypt message with/i,
  /no matching sessions/i,
  /Error decrypting/i,
  /SenderKeyMessage/i,
  /failed to decrypt group/i,
];

function suppress(fn) {
  return (...args) => {
    try {
      const str = args.map(a => {
        if (typeof a === 'string') return a;

        if (a && typeof a === 'object') {
          if (
            a._chains ||
            a.currentRatchet ||
            a.indexInfo
          ) {
            return '[SessionEntry]';
          }

          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }

        return String(a ?? '');
      }).join(' ');

      if (SUPPRESS.some(p => p.test(str))) {
        return;
      }
    } catch {
      // pass through
    }

    fn(...args);
  };
}

console.log = suppress(_origLog);
console.error = suppress(_origErr);
console.warn = suppress(_origWarn);

// ─── Simple contacts store ───
const store = {
  contacts: {}
};

// ─── Global crash guard ───
process.on('uncaughtException', (err) => {
  _origLog(
    chalk.red(
      `⚠️ Uncaught Exception (handled): ${err.message}`
    )
  );

  // DO NOT clear session on crypto errors.
  // Baileys handles key re-exchange automatically.
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);

  _origLog(
    chalk.red(
      `⚠️ Unhandled Rejection (handled): ${msg}`
    )
  );

  // DO NOT clear session on crypto errors.
  // Baileys handles key re-exchange automatically.
});

// ─── Banner ───
_origLog(orange(`
╔══════════════════════════════════╗
║         ℂ𝕃𝕆𝕌𝔻 𝔸𝕀  v3.2          ║
║     by 𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸              ║
╚══════════════════════════════════╝
`));

// ══════════════════════════════════════════════════════════════
// PAIRING-CODE AUTHENTICATION
// ══════════════════════════════════════════════════════════════

// ─── Normalize phone number ───
function normalizePhoneNumber(number) {
  return String(number || '')
    .replace(/[^0-9]/g, '');
}

// ─── Save pairing number ───
function savePairingNumber(number) {
  try {
    const normalized = normalizePhoneNumber(number);

    if (!normalized) {
      return false;
    }

    fs.writeFileSync(
      phoneFile,
      normalized,
      'utf8'
    );

    return true;
  } catch (err) {
    _origLog(
      chalk.red(
        `❌ Failed to save pairing number: ${err.message}`
      )
    );

    return false;
  }
}

// ─── Load pairing number ───
function loadPairingNumber() {
  try {
    if (!fs.existsSync(phoneFile)) {
      return null;
    }

    const number = fs
      .readFileSync(phoneFile, 'utf8')
      .trim();

    return normalizePhoneNumber(number);
  } catch {
    return null;
  }
}

// ─── Delete pairing number ───
function deletePairingNumber() {
  try {
    if (fs.existsSync(phoneFile)) {
      fs.unlinkSync(phoneFile);
    }
  } catch {}
}

// ─── Ask for phone number ───
async function askForPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      chalk.cyan(
        '\n📱 Enter WhatsApp number with country code (example: 2547XXXXXXXX): '
      ),
      (answer) => {
        rl.close();

        const number =
          normalizePhoneNumber(answer);

        if (!number) {
          resolve(null);
          return;
        }

        savePairingNumber(number);

        resolve(number);
      }
    );
  });
}

// ─── Get phone number for pairing ───
async function getPairingNumber() {
  // 1. Previously saved number
  let number = loadPairingNumber();

  if (number) {
    return number;
  }

  // 2. PAIRING_NUMBER environment variable
  if (process.env.PAIRING_NUMBER) {
    number = normalizePhoneNumber(
      process.env.PAIRING_NUMBER
    );

    if (number) {
      savePairingNumber(number);
      return number;
    }
  }

  // 3. OWNER_NUMBER from config
  if (config?.OWNER_NUMBER) {
    number = normalizePhoneNumber(
      config.OWNER_NUMBER
    );

    if (number) {
      savePairingNumber(number);
      return number;
    }
  }

  // 4. Ask through terminal
  return await askForPhoneNumber();
}

// ─── Display pairing code ───
function showPairingCode(code) {
  _origLog(
    chalk.cyan(`
╔══════════════════════════════════════════╗
║          WHATSAPP PAIRING CODE           ║
╠══════════════════════════════════════════╣
║                                          ║
║              ${code}                    ║
║                                          ║
╚══════════════════════════════════════════╝
`)
  );

  _origLog(
    chalk.yellow(
      '📱 WhatsApp → Linked Devices → Link a Device'
    )
  );

  _origLog(
    chalk.yellow(
      '➡️  Choose "Link with phone number instead"'
    )
  );

  _origLog('');
}

// ─── Clear local authentication ───
function clearSession() {
  try {
    fs.rmSync(sessionDir, {
      recursive: true,
      force: true,
    });
  } catch (_) {}

  try {
    fs.mkdirSync(sessionDir, {
      recursive: true,
    });
  } catch (_) {}

  deletePairingNumber();
}

// ══════════════════════════════════════════════════════════════
// CONNECT
// ══════════════════════════════════════════════════════════════

async function connectToWhatsApp() {
  // Guard: one connection attempt at a time
  if (isConnecting) return;

  isConnecting = true;

  let pairingRequested = false;

  try {
    // ─── Local Multi-File Auth State ───
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      sessionDir
    );

    // ─── Baileys Version ───
    const {
      version
    } = await fetchLatestBaileysVersion();

    _origLog(
      chalk.gray(
        `📦 Baileys version: ${version.join('.')}`
      )
    );

    // ─── Pairing number only required before registration ───
    let pairingNumber = null;

    if (!state.creds.registered) {
      pairingNumber = await getPairingNumber();

      if (!pairingNumber) {
        isConnecting = false;

        throw new Error(
          'No phone number supplied for pairing.'
        );
      }

      _origLog(
        lime(
          `📱 Pairing number: +${pairingNumber}`
        )
      );
    }

    // ─── Create WhatsApp socket ───
    const conn = makeWASocket({
      version,

      logger: pino({
        level: 'warn'
      }),

      printQRInTerminal: false,

      browser: Browsers.ubuntu('Chrome'),

      auth: {
        creds: state.creds,

        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({
            level: 'warn'
          })
        ),
      },

      msgRetryCounterCache,

      generateHighQualityLinkPreview: true,

      syncFullHistory: false,

      downloadMediaMessage,

      getMessage: async (key) => {
        const stored =
          messageStore.get(
            `${key.remoteJid}:${key.id}`
          );

        return stored || undefined;
      },
    });

    // Update global ref
    activeConn = conn;

    isConnecting = false;

    // ─── Contacts store ───
    conn.ev.on(
      'contacts.upsert',
      (contacts) => {
        for (const c of contacts) {
          if (c.id) {
            store.contacts[c.id] = c;
          }
        }
      }
    );

    conn.ev.on(
      'contacts.update',
      (updates) => {
        for (const u of updates) {
          if (u.id) {
            store.contacts[u.id] = {
              ...(store.contacts[u.id] || {}),
              ...u
            };
          }
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // CONNECTION UPDATES
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'connection.update',
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        // ──────────────────────────────────────────────────────
        // REQUEST PAIRING CODE
        // ──────────────────────────────────────────────────────

        if (
          qr &&
          pairingNumber &&
          !state.creds.registered &&
          !pairingRequested
        ) {
          pairingRequested = true;

          try {
            _origLog(
              chalk.cyan(
                '\n🔐 Requesting WhatsApp pairing code...'
              )
            );

            const code =
              await conn.requestPairingCode(
                pairingNumber
              );

            showPairingCode(code);

          } catch (err) {
            pairingRequested = false;

            _origLog(
              chalk.red(
                `❌ Pairing code error: ${err.message}`
              )
            );
          }
        }

        // ──────────────────────────────────────────────────────
        // CONNECTION CLOSED
        // ──────────────────────────────────────────────────────

        if (connection === 'close') {
          activeConn = null;

          const code =
            lastDisconnect?.error?.output?.statusCode;

          // ────────────────────────────────────────────────
          // LOGGED OUT
          // ────────────────────────────────────────────────

          if (
            code === DisconnectReason.loggedOut ||
            code === 401
          ) {
            _origLog(
              chalk.yellow(
                '🔄 Session expired/logged out. Clearing and reconnecting...'
              )
            );

            clearSession();

            reconnectAttempts = 0;
            initialConnection = true;

            setTimeout(
              () => connectToWhatsApp(),
              3000
            );

          // ────────────────────────────────────────────────
          // STREAM CONFLICT
          // ────────────────────────────────────────────────

          } else if (code === 440) {
            reconnectAttempts++;

            const wait440 =
              reconnectAttempts <= 3
                ? 60000
                : Math.min(
                    60000 *
                      reconnectAttempts,
                    300000
                  );

            _origLog(
              chalk.yellow(
                `⚡ Stream conflict (440). Attempt ${reconnectAttempts} — waiting ${Math.round(wait440 / 1000)}s...`
              )
            );

            setTimeout(
              () => connectToWhatsApp(),
              wait440
            );

          // ────────────────────────────────────────────────
          // TEMPORARY DISCONNECT
          // ────────────────────────────────────────────────

          } else if (
            code === 408 ||
            code === 503
          ) {
            reconnectAttempts++;

            const delay =
              Math.min(
                5000 *
                  Math.pow(
                    1.5,
                    reconnectAttempts
                  ),
                60000
              );

            _origLog(
              chalk.yellow(
                `🔌 Disconnected (${code}). Attempt ${reconnectAttempts} — retry in ${Math.round(delay / 1000)}s...`
              )
            );

            setTimeout(
              () => connectToWhatsApp(),
              delay
            );

          // ────────────────────────────────────────────────
          // GENERAL RECONNECT
          // ────────────────────────────────────────────────

          } else {
            reconnectAttempts++;

            const delay =
              Math.min(
                4000 *
                  reconnectAttempts,
                30000
              );

            _origLog(
              chalk.yellow(
                `🔌 Disconnected (${code}). Reconnecting in ${Math.round(delay / 1000)}s...`
              )
            );

            setTimeout(
              () => connectToWhatsApp(),
              delay
            );
          }
        }

        // ──────────────────────────────────────────────────────
        // CONNECTION OPEN
        // ──────────────────────────────────────────────────────

        if (connection === 'open') {
          reconnectAttempts = 0;

          // Pairing is complete.
          deletePairingNumber();

          if (initialConnection) {
            initialConnection = false;

            const botNum =
              conn.user?.id?.split(':')[0];

            _origLog(
              lime(
                `\n✅ ${config.BOT_NAME} Connected!`
              )
            );

            _origLog(
              '[SELFTEST] Attempting self-message send...'
            );

            _origLog(
              lime(
                `👑 Owner  : ${config.OWNER_NAME} (+${config.OWNER_NUMBER})`
              )
            );

            _origLog(
              lime(
                `📱 Number : ${botNum}`
              )
            );

            _origLog(
              lime(
                `📶 Mode   : ${config.MODE}`
              )
            );

            _origLog(
              lime(
                `🔧 Prefix : ${config.PREFIX}\n`
              )
            );

            // ──────────────────────────────────────────────
            // SELF MESSAGE
            // ──────────────────────────────────────────────

            try {
              const selfJid =
                `${botNum}@s.whatsapp.net`;

              await conn.sendMessage(
                selfJid,
                {
                  text:
`╔══════════════════════╗
║  *${config.BOT_NAME}* Online ✅  ║
╚══════════════════════╝

🤖 *Bot:* ${config.BOT_NAME}
📱 *Number:* ${botNum}
📶 *Mode:* ${config.MODE}
👑 *Owner:* ${config.OWNER_NAME}
🕒 *Time:* ${moment()
  .tz('Africa/Nairobi')
  .format('HH:mm:ss DD/MM/YYYY')}

_Type ${config.PREFIX}menu to see all commands_ 🌩️`,
                }
              );

            } catch (_) {}

            // ──────────────────────────────────────────────
            // RESOLVE OWNER LID
            // ──────────────────────────────────────────────

            try {
              const ownerPhone =
                config.OWNER_NUMBER +
                '@s.whatsapp.net';

              const results =
                await conn.onWhatsApp(
                  config.OWNER_NUMBER
                );

              const ownerInfo =
                Array.isArray(results)
                  ? results[0]
                  : results;

              if (
                ownerInfo?.jid &&
                ownerInfo.jid !== ownerPhone
              ) {
                lidMap.set(
                  ownerInfo.jid,
                  ownerPhone
                );

                lidMap.set(
                  ownerPhone,
                  ownerInfo.jid
                );

                _origLog(
                  lime(
                    `🔑 Owner LID resolved: ${ownerInfo.jid} → ${ownerPhone}`
                  )
                );
              }

            } catch (_) {}
          }
        }
      }
    );

    // ─── Save credentials ───
    conn.ev.on(
      'creds.update',
      saveCreds
    );

    // ══════════════════════════════════════════════════════════
    // LID MAP
    // ══════════════════════════════════════════════════════════

    const updateLidMap = (items) => {
      for (
        const c of (
          Array.isArray(items)
            ? items
            : Object.values(items)
        )
      ) {
        const lid =
          c.lid ||
          c.lidJid;

        const id =
          c.id ||
          c.jid;

        if (
          lid &&
          id &&
          !id.endsWith('@lid')
        ) {
          lidMap.set(
            lid,
            id
          );
        }

        if (
          c.id &&
          !c.id.endsWith('@lid') &&
          c.lidJid
        ) {
          lidMap.set(
            c.lidJid,
            c.id
          );
        }
      }
    };

    conn.ev.on(
      'contacts.upsert',
      updateLidMap
    );

    conn.ev.on(
      'contacts.update',
      updateLidMap
    );

    conn.ev.on(
      'chats.upsert',
      updateLidMap
    );

    conn.ev.on(
      'chats.update',
      updateLidMap
    );

    conn.ev.on(
      'messaging-history.set',
      () =>
        updateLidMap(
          Object.values(
            store.contacts || {}
          )
        )
    );

    // ══════════════════════════════════════════════════════════
    // MESSAGES
    // ══════════════════════════════════════════════════════════

    // ─── ALL events diagnostic ───
    conn.ev.process(
      async (events) => {
        const evKeys =
          Object.keys(events);
      }
    );

    conn.ev.on(
      'messages.upsert',
      async ({
        messages,
        type
      }) => {

        _origLog(
          '[MSG_IN] messages.upsert fired — type:',
          type,
          'count:',
          messages.length
        );

        const isInteractiveResponse =
          (msg) => !!(
            msg.message?.interactiveResponseMessage ||
            msg.message?.viewOnceMessage?.message?.interactiveResponseMessage ||
            msg.message?.buttonsResponseMessage ||
            msg.message?.listResponseMessage ||
            msg.message?.templateButtonReplyMessage
          );

        // 'notify' = normal incoming messages
        // 'append' = group @lid / multi-device
        // MUST be processed too
        if (
          type !== 'notify' &&
          type !== 'append' &&
          !messages.some(
            isInteractiveResponse
          )
        ) {
          return;
        }

        for (
          let msg of messages
        ) {

          // Skip bot's own outgoing append messages
          if (
            msg.key?.fromMe &&
            type === 'append' &&
            !isInteractiveResponse(msg)
          ) {
            continue;
          }

          try {

            // ──────────────────────────────────────────────
            // Resolve @lid JIDs
            // ──────────────────────────────────────────────

            const tryResolveLid =
              (lid) => {

                if (
                  !lid ||
                  !lid.endsWith('@lid')
                ) {
                  return lid;
                }

                let resolved =
                  lidMap.get(lid);

                if (!resolved) {
                  const match =
                    Object.values(
                      store?.contacts || {}
                    ).find(
                      c =>
                        (
                          c.lid ||
                          c.lidJid
                        ) === lid
                    );

                  if (match?.id) {
                    resolved =
                      match.id;

                    lidMap.set(
                      lid,
                      resolved
                    );
                  }
                }

                return (
                  resolved &&
                  !resolved.endsWith('@lid')
                )
                  ? resolved
                  : lid;
              };

            if (
              msg.key?.remoteJid?.endsWith(
                '@lid'
              )
            ) {
              const resolved =
                tryResolveLid(
                  msg.key.remoteJid
                );

              if (
                resolved !==
                msg.key.remoteJid
              ) {
                msg = {
                  ...msg,
                  key: {
                    ...msg.key,
                    remoteJid:
                      resolved
                  }
                };
              }
            }

            if (
              msg.key?.participant?.endsWith(
                '@lid'
              )
            ) {
              const resolved =
                tryResolveLid(
                  msg.key.participant
                );

              if (
                resolved !==
                msg.key.participant
              ) {
                msg = {
                  ...msg,
                  key: {
                    ...msg.key,
                    participant:
                      resolved
                  }
                };
              }
            }

            // ──────────────────────────────────────────────
            // STATUS
            // ──────────────────────────────────────────────

            if (
              msg.key?.remoteJid ===
              'status@broadcast'
            ) {

              if (
                config.AUTO_STATUS_SEEN
              ) {
                await conn
                  .readMessages([
                    msg.key
                  ])
                  .catch(() => {});
              }

              if (
                config.AUTO_STATUS_REACT
              ) {
                const emojis = [
                  '❤️',
                  '🔥',
                  '😍',
                  '💯',
                  '👏',
                  '✨',
                  '🌟',
                  '🎉'
                ];

                await conn
                  .sendMessage(
                    'status@broadcast',
                    {
                      react: {
                        text:
                          emojis[
                            Math.floor(
                              Math.random() *
                              emojis.length
                            )
                          ],
                        key: msg.key
                      }
                    },
                    {
                      statusJidList: [
                        msg.key.participant
                      ]
                    }
                  )
                  .catch(() => {});
              }

              if (
                config.AUTO_STATUS_REPLY &&
                config.STATUS_READ_MSG
              ) {
                await conn
                  .sendMessage(
                    msg.key.participant,
                    {
                      text:
                        config.STATUS_READ_MSG
                    }
                  )
                  .catch(() => {});
              }

              continue;
            }

            // ──────────────────────────────────────────────
            // STORE MESSAGES
            // ──────────────────────────────────────────────

            if (msg.message) {

              messageStore.set(
                `${msg.key.remoteJid}:${msg.key.id}`,
                msg.message
              );

              if (
                config.ANTI_DELETE &&
                !msg.key.fromMe
              ) {
                messageStore.set(
                  msg.key.id,
                  {
                    msg,
                    ts: Date.now()
                  }
                );
              }

              if (
                messageStore.size > 600
              ) {
                messageStore.delete(
                  messageStore
                    .keys()
                    .next()
                    .value
                );
              }
            }

            // ──────────────────────────────────────────────
            // AUTO READ
            // ──────────────────────────────────────────────

            if (
              config.AUTO_READ
            ) {
              await conn
                .readMessages([
                  msg.key
                ])
                .catch(() => {});
            }

            // ──────────────────────────────────────────────
            // PROCESS MESSAGE
            // ──────────────────────────────────────────────

            await Handler(
              conn,
              msg,
              ALL_PLUGINS
            );

          } catch (err) {
            _origLog(
              chalk.red(
                '[MSG ERROR]'
              ),
              err?.message
            );
          }
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // ANTI-DELETE
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'messages.delete',
      async (item) => {

        if (!config.ANTI_DELETE) {
          return;
        }

        try {
          const keys =
            item.keys || [];

          for (
            const key of keys
          ) {

            const stored =
              messageStore.get(
                key.id
              );

            if (!stored) {
              continue;
            }

            const {
              msg
            } = stored;

            const msgType =
              getContentType(
                msg.message
              );

            const target =
              config.DELETE_PATH === 'pm'
                ? `${config.OWNER_NUMBER}@s.whatsapp.net`
                : msg.key.remoteJid;

            const deleter =
              key.participant ||
              msg.key.remoteJid;

            // ──────────────────────────────────────────────
            // ALERT
            // ──────────────────────────────────────────────

            await conn.sendMessage(
              target,
              {
                text:
`🗑️ *Anti-Delete Alert!*

👤 *From:* @${deleter.split('@')[0]}
💬 *Chat:* ${msg.key.remoteJid}
📄 *Type:* ${msgType}
🕒 *Time:* ${moment()
  .tz('Africa/Nairobi')
  .format('HH:mm:ss')}`,

                mentions: [
                  deleter
                ],
              }
            ).catch(() => {});

            // ──────────────────────────────────────────────
            // TEXT
            // ──────────────────────────────────────────────

            if (
              msgType ===
                'conversation' ||
              msgType ===
                'extendedTextMessage'
            ) {

              const text =
                msg.message
                  ?.conversation ||
                msg.message
                  ?.extendedTextMessage
                  ?.text;

              if (text) {
                await conn
                  .sendMessage(
                    target,
                    {
                      text:
                        `📝 *Deleted Message:*\n${text}`
                    }
                  )
                  .catch(() => {});
              }

            // ──────────────────────────────────────────────
            // IMAGE
            // ──────────────────────────────────────────────

            } else if (
              msgType ===
              'imageMessage'
            ) {

              try {
                const buf =
                  await downloadMediaMessage(
                    msg,
                    'buffer',
                    {}
                  );

                await conn.sendMessage(
                  target,
                  {
                    image: buf,
                    caption:
                      '📸 *Deleted Image*'
                  }
                );

              } catch {}

            // ──────────────────────────────────────────────
            // VIDEO
            // ──────────────────────────────────────────────

            } else if (
              msgType ===
              'videoMessage'
            ) {

              try {
                const buf =
                  await downloadMediaMessage(
                    msg,
                    'buffer',
                    {}
                  );

                await conn.sendMessage(
                  target,
                  {
                    video: buf,
                    caption:
                      '🎬 *Deleted Video*'
                  }
                );

              } catch {}
            }

            messageStore.delete(
              key.id
            );
          }

        } catch (err) {
          _origLog(
            '[ANTIDELETE ERROR]',
            err?.message
          );
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // CALLS
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'call',
      (call) =>
        handleCall(
          conn,
          call
        )
    );

    // ══════════════════════════════════════════════════════════
    // GROUP EVENTS
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'group-participants.update',
      async (update) => {
        try {
          await onGroupUpdate(
            conn,
            update
          );
        } catch {}
      }
    );

  } catch (err) {

    isConnecting = false;

    _origLog(
      chalk.red(
        '[CONNECT ERROR]'
      ),
      err?.message
    );

    reconnectAttempts++;

    setTimeout(
      () => connectToWhatsApp(),
      Math.min(
        4000 *
          reconnectAttempts,
        30000
      )
    );
  }
}

// ══════════════════════════════════════════════════════════════
// KEEP-ALIVE SERVER
// ══════════════════════════════════════════════════════════════

app.get(
  '/',
  (req, res) =>
    res.json({
      status: 'online',
      bot: config.BOT_NAME,
      owner: config.OWNER_NAME,
      uptime:
        Math.floor(
          process.uptime()
        ) + 's',
      prefix: config.PREFIX,
      mode: config.MODE,
      time:
        moment()
          .tz('Africa/Nairobi')
          .format(
            'HH:mm:ss DD/MM/YYYY'
          ),
    })
);

app.listen(
  PORT,
  () =>
    _origLog(
      lime(
        `🌐 Keep-alive server: port ${PORT}`
      )
    )
);

// ══════════════════════════════════════════════════════════════
// GLOBAL SINGLETON INTERVALS
// ══════════════════════════════════════════════════════════════

// Always-online presence — 60s
setInterval(
  () => {
    if (
      activeConn &&
      config.ALWAYS_ONLINE
    ) {
      activeConn
        .sendPresenceUpdate(
          'available'
        )
        .catch(() => {});
    }
  },
  60000
);

// ─── Heartbeat ───
setInterval(
  () => {
    const up =
      Math.floor(
        process.uptime()
      );

    const h =
      Math.floor(
        up / 3600
      );

    const m =
      Math.floor(
        (up % 3600) / 60
      );

    const s =
      up % 60;

    const st =
      activeConn
        ? '🟢 connected'
        : '🔴 reconnecting';

    _origLog(
      lime(
        `💓 ${h}h${m}m${s}s | ${st} | store:${messageStore.size}`
      )
    );
  },
  10 * 60 * 1000
);

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

// Ensure yt-dlp binary exists before connecting
ensureYtDlp()
  .then(
    () =>
      connectToWhatsApp()
  )
  .catch(
    (err) => {
      _origLog(
        chalk.yellow(
          `⚠️ yt-dlp unavailable: ${err.message} — download commands may be limited`
        )
      );

      connectToWhatsApp();
    }
  );
