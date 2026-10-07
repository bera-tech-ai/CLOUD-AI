import dotenv from 'dotenv';
dotenv.config();

import {
  makeWASocket,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  initAuthCreds,
  getContentType,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import { MongoClient } from 'mongodb';

import { Handler, Callupdate } from './data/handler.js';
import { lidMap } from './lib/Serializer.js';
import { ensureYtDlp } from './lib/ytdlp.js';

import express from 'express';
import pino from 'pino';
import NodeCache from 'node-cache';
import chalk from 'chalk';
import moment from 'moment-timezone';
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
  beraPlugin,
  btnmenuPlugin,
  generalPlugin,
  aiPlugin,
  imaginePlugin,
  animePlugin,
  photoPlugin,
  downloaderPlugin,
  converterPlugin,
  toolsPlugin,
  extraPlugin,
  groupPlugin,
  ownerPlugin,
  searchPlugin,
  gamesPlugin,
  settingsPlugin,
  techPlugin,
  funPlugin,
  infoPlugin,
  dbaPlugin,
];

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const app = express();

const PORT =
  parseInt(process.env.PORT || '3000', 10);

/*
 * CHANGE THIS VALUE.
 *
 * Do NOT use the MongoDB password you pasted into chat.
 * Rotate that password in MongoDB Atlas first.
 */
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://ellyongiro8:QwXDXE6tyrGpUTNb@cluster0.tyxcmm9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
';

const MONGODB_DB =
  process.env.MONGODB_DB ||
  'cloud_ai';

const MONGODB_COLLECTION =
  process.env.MONGODB_COLLECTION ||
  'baileys_auth';

const SESSION_ID =
  process.env.BAILEYS_SESSION_ID ||
  'cloud-ai-main';

const lime =
  chalk.bold.hex('#32CD32');

const orange =
  chalk.bold.hex('#FFA500');

// ══════════════════════════════════════════════════════════════
// GLOBAL STATE
// ══════════════════════════════════════════════════════════════

let mongoClient = null;
let authCollection = null;

let activeConn = null;

let reconnectTimer = null;

let reconnectAttempts = 0;

let isConnecting = false;

let socketGeneration = 0;

let shuttingDown = false;

let initialConnection = true;

let pairingRequested = false;

const msgRetryCounterCache =
  new NodeCache();

const messageStore =
  new Map();

const store = {
  contacts: {}
};

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

const _origLog =
  console.log;

const _origErr =
  console.error;

const _origWarn =
  console.warn;

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
      const str =
        args
          .map((a) => {
            if (typeof a === 'string') {
              return a;
            }

            if (
              a &&
              typeof a === 'object'
            ) {
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
          })
          .join(' ');

      if (
        SUPPRESS.some((p) =>
          p.test(str)
        )
      ) {
        return;
      }
    } catch {}

    fn(...args);
  };
}

console.log =
  suppress(_origLog);

console.error =
  suppress(_origErr);

console.warn =
  suppress(_origWarn);

// ══════════════════════════════════════════════════════════════
// CRASH GUARD
// ══════════════════════════════════════════════════════════════

process.on(
  'uncaughtException',
  (err) => {
    _origLog(
      chalk.red(
        `⚠️ Uncaught Exception: ${err?.stack || err?.message || err}`
      )
    );
  }
);

process.on(
  'unhandledRejection',
  (reason) => {
    _origLog(
      chalk.red(
        `⚠️ Unhandled Rejection: ${
          reason?.stack ||
          reason?.message ||
          String(reason)
        }`
      )
    );
  }
);

// ══════════════════════════════════════════════════════════════
// BANNER
// ══════════════════════════════════════════════════════════════

_origLog(
  orange(`
╔══════════════════════════════════╗
║         ℂ𝕃𝕆𝕌𝔻 𝔸𝕀  v3.2          ║
║     by 𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸              ║
╚══════════════════════════════════╝
`)
);

// ══════════════════════════════════════════════════════════════
// MONGODB
// ══════════════════════════════════════════════════════════════

async function connectMongo() {
  if (authCollection) {
    return authCollection;
  }

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not configured.'
    );
  }

  _origLog(
    chalk.cyan(
      '🍃 Connecting to MongoDB...'
    )
  );

  mongoClient =
    new MongoClient(
      MONGODB_URI,
      {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      }
    );

  await mongoClient.connect();

  const db =
    mongoClient.db(MONGODB_DB);

  authCollection =
    db.collection(
      MONGODB_COLLECTION
    );

  await authCollection.createIndex(
    {
      sessionId: 1,
      type: 1,
      key: 1,
    },
    {
      unique: true,
    }
  );

  _origLog(
    chalk.green(
      `✅ MongoDB connected: ${MONGODB_DB}`
    )
  );

  return authCollection;
}

// ══════════════════════════════════════════════════════════════
// SERIALIZATION
// ══════════════════════════════════════════════════════════════

function serializeValue(value) {
  if (
    Buffer.isBuffer(value)
  ) {
    return {
      __type: 'Buffer',
      data: value.toString('base64'),
    };
  }

  if (
    value instanceof Uint8Array
  ) {
    return {
      __type: 'Buffer',
      data: Buffer
        .from(value)
        .toString('base64'),
    };
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      serializeValue
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const result = {};

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      result[key] =
        serializeValue(val);
    }

    return result;
  }

  return value;
}

function deserializeValue(value) {
  if (
    value &&
    typeof value === 'object' &&
    value.__type === 'Buffer' &&
    typeof value.data === 'string'
  ) {
    return Buffer.from(
      value.data,
      'base64'
    );
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      deserializeValue
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const result = {};

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      result[key] =
        deserializeValue(val);
    }

    return result;
  }

  return value;
}

// ══════════════════════════════════════════════════════════════
// MONGODB BAILEYS AUTH STATE
// ══════════════════════════════════════════════════════════════

async function useMongoAuthState(
  sessionId
) {
  const collection =
    await connectMongo();

  const credsDocument =
    await collection.findOne({
      sessionId,
      type: 'creds',
    });

  let creds;

  if (credsDocument?.data) {
    creds =
      deserializeValue(
        credsDocument.data
      );

    _origLog(
      chalk.green(
        '🔐 Existing Baileys credentials loaded from MongoDB.'
      )
    );
  } else {
    creds =
      initAuthCreds();

    _origLog(
      chalk.yellow(
        '🆕 No Baileys credentials found. Pairing will be required.'
      )
    );
  }

  const keys = {
    get: async (
      type,
      ids
    ) => {
      const documents =
        await collection
          .find({
            sessionId,
            type: `key:${type}`,
            key: {
              $in: ids,
            },
          })
          .toArray();

      const result = {};

      for (
        const id of ids
      ) {
        const document =
          documents.find(
            (doc) =>
              doc.key === id
          );

        if (
          document?.data !==
          undefined
        ) {
          result[id] =
            deserializeValue(
              document.data
            );
        }
      }

      return result;
    },

    set: async (
      data
    ) => {
      const operations = [];

      for (
        const [type, entries]
        of Object.entries(data)
      ) {
        for (
          const [id, value]
          of Object.entries(entries)
        ) {
          const filter = {
            sessionId,
            type: `key:${type}`,
            key: id,
          };

          if (
            value === null ||
            value === undefined
          ) {
            operations.push({
              deleteOne: {
                filter,
              },
            });
          } else {
            operations.push({
              updateOne: {
                filter,
                update: {
                  $set: {
                    sessionId,
                    type: `key:${type}`,
                    key: id,
                    data:
                      serializeValue(
                        value
                      ),
                    updatedAt:
                      new Date(),
                  },
                },
                upsert: true,
              },
            });
          }
        }
      }

      if (
        operations.length
      ) {
        await collection.bulkWrite(
          operations,
          {
            ordered: false,
          }
        );
      }
    },
  };

  const saveCreds =
    async () => {
      await collection.updateOne(
        {
          sessionId,
          type: 'creds',
        },
        {
          $set: {
            sessionId,
            type: 'creds',
            data:
              serializeValue(
                creds
              ),
            updatedAt:
              new Date(),
          },
        },
        {
          upsert: true,
        }
      );
    };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds,
  };
}

// ══════════════════════════════════════════════════════════════
// DELETE AUTHENTICATION
// ══════════════════════════════════════════════════════════════

async function clearMongoSession() {
  if (!authCollection) {
    return;
  }

  await authCollection.deleteMany({
    sessionId:
      SESSION_ID,
  });

  _origLog(
    chalk.yellow(
      '🗑️ Baileys authentication removed from MongoDB.'
    )
  );
}

// ══════════════════════════════════════════════════════════════
// PHONE NUMBER
// ══════════════════════════════════════════════════════════════

function normalizePhoneNumber(
  number
) {
  return String(number || '')
    .replace(
      /[^0-9]/g,
      ''
    );
}

function getPairingNumber() {
  const number =
    normalizePhoneNumber(
      process.env.PAIRING_NUMBER ||
      config?.OWNER_NUMBER ||
      ''
    );

  return number || null;
}

// ══════════════════════════════════════════════════════════════
// RECONNECT CONTROL
// ══════════════════════════════════════════════════════════════

function clearReconnectTimer() {
  if (
    reconnectTimer
  ) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }
}

function scheduleReconnect(
  reason = 'unknown'
) {
  if (shuttingDown) {
    return;
  }

  if (
    reconnectTimer
  ) {
    return;
  }

  reconnectAttempts++;

  const delay =
    Math.min(
      5000 *
        Math.pow(
          1.5,
          reconnectAttempts - 1
        ),
      60000
    );

  _origLog(
    chalk.yellow(
      `🔄 Reconnecting because of ${reason}. Attempt ${reconnectAttempts} in ${Math.round(delay / 1000)}s...`
    )
  );

  reconnectTimer =
    setTimeout(
      async () => {
        reconnectTimer =
          null;

        await connectToWhatsApp();
      },
      delay
    );
}

// ══════════════════════════════════════════════════════════════
// SOCKET VALIDATION
// ══════════════════════════════════════════════════════════════

function isCurrentSocket(
  conn,
  generation
) {
  return (
    !shuttingDown &&
    activeConn === conn &&
    socketGeneration ===
      generation
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN CONNECTION
// ══════════════════════════════════════════════════════════════

async function connectToWhatsApp() {
  if (shuttingDown) {
    return;
  }

  /*
   * VERY IMPORTANT:
   *
   * Never create another socket if one already exists.
   */
  if (
    activeConn ||
    isConnecting
  ) {
    return;
  }

  isConnecting = true;

  clearReconnectTimer();

  const generation =
    ++socketGeneration;

  try {
    // ──────────────────────────────────────────────────────────
    // LOAD AUTH FROM MONGODB
    // ──────────────────────────────────────────────────────────

    const {
      state,
      saveCreds,
    } =
      await useMongoAuthState(
        SESSION_ID
      );

    // ──────────────────────────────────────────────────────────
    // BAILEYS VERSION
    // ──────────────────────────────────────────────────────────

    const {
      version,
    } =
      await fetchLatestBaileysVersion();

    _origLog(
      chalk.gray(
        `📦 WhatsApp Web version: ${version.join('.')}`
      )
    );

    // ──────────────────────────────────────────────────────────
    // PAIRING
    // ──────────────────────────────────────────────────────────

    let pairingNumber =
      null;

    if (
      !state.creds.registered
    ) {
      pairingNumber =
        getPairingNumber();

      if (
        !pairingNumber
      ) {
        throw new Error(
          'No PAIRING_NUMBER or OWNER_NUMBER configured.'
        );
      }

      _origLog(
        lime(
          `📱 Pairing number: +${pairingNumber}`
        )
      );
    }

    // ──────────────────────────────────────────────────────────
    // CREATE SOCKET
    // ──────────────────────────────────────────────────────────

    const conn =
      makeWASocket({
        version,

        logger:
          pino({
            level: 'warn',
          }),

        printQRInTerminal:
          false,

        browser:
          Browsers.ubuntu(
            'Chrome'
          ),

        auth: {
          creds:
            state.creds,

          keys:
            makeCacheableSignalKeyStore(
              state.keys,
              pino({
                level: 'warn',
              })
            ),
        },

        msgRetryCounterCache,

        generateHighQualityLinkPreview:
          true,

        syncFullHistory:
          false,

        getMessage:
          async (key) => {
            const stored =
              messageStore.get(
                `${key.remoteJid}:${key.id}`
              );

            return (
              stored ||
              undefined
            );
          },
      });

    activeConn =
      conn;

    isConnecting =
      false;

    pairingRequested =
      false;

    _origLog(
      chalk.cyan(
        `🔌 Socket created [generation ${generation}]`
      )
    );

    // ══════════════════════════════════════════════════════════
    // CONTACTS
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'contacts.upsert',
      (contacts) => {
        for (
          const c of contacts
        ) {
          if (c.id) {
            store.contacts[c.id] =
              c;
          }
        }
      }
    );

    conn.ev.on(
      'contacts.update',
      (updates) => {
        for (
          const u of updates
        ) {
          if (u.id) {
            store.contacts[u.id] = {
              ...(store.contacts[
                u.id
              ] || {}),
              ...u,
            };
          }
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // CONNECTION UPDATE
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'connection.update',
      async (update) => {
        /*
         * Ignore events from an old socket.
         *
         * This is one of the most important fixes.
         */
        if (
          !isCurrentSocket(
            conn,
            generation
          )
        ) {
          return;
        }

        const {
          connection,
          lastDisconnect,
        } = update;

        // ──────────────────────────────────────────────────────
        // REQUEST PAIRING CODE
        // ──────────────────────────────────────────────────────

        if (
          connection ===
            'connecting' &&
          !state.creds.registered &&
          pairingNumber &&
          !pairingRequested
        ) {
          pairingRequested =
            true;

          try {
            _origLog(
              chalk.cyan(
                '🔐 Requesting WhatsApp pairing code...'
              )
            );

            const code =
              await conn.requestPairingCode(
                pairingNumber
              );

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
                '➡️ Choose "Link with phone number instead"'
              )
            );
          } catch (err) {
            pairingRequested =
              false;

            _origLog(
              chalk.red(
                `❌ Pairing code error: ${err.message}`
              )
            );
          }
        }

        // ──────────────────────────────────────────────────────
        // CONNECTION OPEN
        // ──────────────────────────────────────────────────────

        if (
          connection ===
          'open'
        ) {
          reconnectAttempts =
            0;

          clearReconnectTimer();

          pairingRequested =
            false;

          _origLog(
            lime(
              `\n✅ ${config.BOT_NAME} Connected!`
            )
          );

          const botNum =
            conn.user?.id
              ?.split(':')[0];

          _origLog(
            lime(
              `📱 Number : ${botNum || 'unknown'}`
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

          if (
            initialConnection
          ) {
            initialConnection =
              false;

            try {
              if (botNum) {
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
              }
            } catch {}
          }

          // ──────────────────────────────────────────────
          // RESOLVE OWNER LID
          // ──────────────────────────────────────────────

          try {
            const results =
              await conn.onWhatsApp(
                config.OWNER_NUMBER
              );

            const ownerInfo =
              Array.isArray(results)
                ? results[0]
                : results;

            const ownerPhone =
              `${config.OWNER_NUMBER}@s.whatsapp.net`;

            if (
              ownerInfo?.jid &&
              ownerInfo.jid !==
                ownerPhone
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
          } catch {}
        }

        // ──────────────────────────────────────────────────────
        // CONNECTION CLOSED
        // ──────────────────────────────────────────────────────

        if (
          connection ===
          'close'
        ) {
          /*
           * Do NOT allow this old socket to remain active.
           */
          if (
            activeConn ===
            conn
          ) {
            activeConn =
              null;
          }

          /*
           * Ignore a close event generated by an old socket.
           */
          if (
            generation !==
            socketGeneration
          ) {
            return;
          }

          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          const errorMessage =
            lastDisconnect
              ?.error
              ?.message ||
            'unknown';

          _origLog(
            chalk.yellow(
              `🔌 Connection closed. Code: ${code}, reason: ${errorMessage}`
            )
          );

          // ════════════════════════════════════════════════════
          // 401 / LOGGED OUT
          // ════════════════════════════════════════════════════

          if (
            code ===
              DisconnectReason.loggedOut ||
            code === 401
          ) {
            /*
             * ONLY HERE do we delete authentication.
             */
            _origLog(
              chalk.red(
                '🚪 WhatsApp session was genuinely logged out.'
              )
            );

            await clearMongoSession();

            reconnectAttempts =
              0;

            initialConnection =
              true;

            /*
             * Give the old socket time to disappear.
             */
            setTimeout(
              () =>
                connectToWhatsApp(),
              3000
            );

            return;
          }

          // ════════════════════════════════════════════════════
          // 440 CONNECTION REPLACED
          // ════════════════════════════════════════════════════

          if (
            code === 440 ||
            code ===
              DisconnectReason.connectionReplaced
          ) {
            /*
             * DO NOT automatically create another socket.
             *
             * 440 means another WhatsApp connection has
             * replaced this one.
             */
            _origLog(
              chalk.red(
                '⚠️ Connection replaced (440). Automatic reconnect stopped to prevent a socket loop.'
              )
            );

            _origLog(
              chalk.yellow(
                '⚠️ Check BeraHost for another running instance of this bot.'
              )
            );

            return;
          }

          // ════════════════════════════════════════════════════
          // 408 TIMEOUT
          // ════════════════════════════════════════════════════

          if (
            code === 408 ||
            code ===
              DisconnectReason.timedOut
          ) {
            /*
             * CRITICAL:
             *
             * 408 does NOT mean the WhatsApp session
             * has expired.
             *
             * DO NOT delete MongoDB authentication.
             */
            scheduleReconnect(
              '408 timeout'
            );

            return;
          }

          // ════════════════════════════════════════════════════
          // 503 / CONNECTION LOST
          // ════════════════════════════════════════════════════

          if (
            code === 503 ||
            code ===
              DisconnectReason.unavailableService
          ) {
            scheduleReconnect(
              '503 service unavailable'
            );

            return;
          }

          // ════════════════════════════════════════════════════
          // RESTART REQUIRED
          // ════════════════════════════════════════════════════

          if (
            code === 515 ||
            code ===
              DisconnectReason.restartRequired
          ) {
            _origLog(
              chalk.yellow(
                '🔄 WhatsApp requested a socket restart.'
              )
            );

            scheduleReconnect(
              'restart required'
            );

            return;
          }

          // ════════════════════════════════════════════════════
          // GENERAL DISCONNECT
          // ════════════════════════════════════════════════════

          scheduleReconnect(
            `disconnect ${code}`
          );
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // SAVE AUTH CREDENTIALS
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'creds.update',
      async () => {
        try {
          await saveCreds();
        } catch (err) {
          _origLog(
            chalk.red(
              `❌ MongoDB credential save failed: ${err.message}`
            )
          );
        }
      }
    );

    // ══════════════════════════════════════════════════════════
    // LID MAP
    // ══════════════════════════════════════════════════════════

    const updateLidMap =
      (items) => {
        for (
          const c of (
            Array.isArray(items)
              ? items
              : Object.values(
                  items || {}
                )
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
            store.contacts ||
              {}
          )
        )
    );

    // ══════════════════════════════════════════════════════════
    // MESSAGES
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'messages.upsert',
      async ({
        messages,
        type,
      }) => {
        _origLog(
          '[MSG_IN] messages.upsert fired — type:',
          type,
          'count:',
          messages.length
        );

        const isInteractiveResponse =
          (msg) =>
            !!(
              msg.message
                ?.interactiveResponseMessage ||
              msg.message
                ?.viewOnceMessage
                ?.message
                ?.interactiveResponseMessage ||
              msg.message
                ?.buttonsResponseMessage ||
              msg.message
                ?.listResponseMessage ||
              msg.message
                ?.templateButtonReplyMessage
            );

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
          if (
            msg.key?.fromMe &&
            type === 'append' &&
            !isInteractiveResponse(
              msg
            )
          ) {
            continue;
          }

          try {
            const tryResolveLid =
              (lid) => {
                if (
                  !lid ||
                  !lid.endsWith(
                    '@lid'
                  )
                ) {
                  return lid;
                }

                let resolved =
                  lidMap.get(
                    lid
                  );

                if (
                  !resolved
                ) {
                  const match =
                    Object.values(
                      store.contacts ||
                        {}
                    ).find(
                      (c) =>
                        (
                          c.lid ||
                          c.lidJid
                        ) === lid
                    );

                  if (
                    match?.id
                  ) {
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
                  !resolved.endsWith(
                    '@lid'
                  )
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
                      resolved,
                  },
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
                      resolved,
                  },
                };
              }
            }

            // STATUS
            if (
              msg.key?.remoteJid ===
              'status@broadcast'
            ) {
              if (
                config.AUTO_STATUS_SEEN
              ) {
                await conn
                  .readMessages([
                    msg.key,
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
                  '🎉',
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
                        key:
                          msg.key,
                      },
                    },
                    {
                      statusJidList: [
                        msg.key
                          .participant,
                      ],
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
                    msg.key
                      .participant,
                    {
                      text:
                        config.STATUS_READ_MSG,
                    }
                  )
                  .catch(() => {});
              }

              continue;
            }

            // STORE MESSAGE
            if (
              msg.message
            ) {
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
                    ts: Date.now(),
                  }
                );
              }

              if (
                messageStore.size >
                600
              ) {
                messageStore.delete(
                  messageStore
                    .keys()
                    .next()
                    .value
                );
              }
            }

            // AUTO READ
            if (
              config.AUTO_READ
            ) {
              await conn
                .readMessages([
                  msg.key,
                ])
                .catch(() => {});
            }

            // HANDLER
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
    // ANTI DELETE
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'messages.delete',
      async (item) => {
        if (
          !config.ANTI_DELETE
        ) {
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
              msg,
            } = stored;

            const msgType =
              getContentType(
                msg.message
              );

            const target =
              config.DELETE_PATH ===
              'pm'
                ? `${config.OWNER_NUMBER}@s.whatsapp.net`
                : msg.key.remoteJid;

            const deleter =
              key.participant ||
              msg.key.remoteJid;

            await conn
              .sendMessage(
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
                    deleter,
                  ],
                }
              )
              .catch(() => {});

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
                        `📝 *Deleted Message:*\n${text}`,
                    }
                  )
                  .catch(() => {});
              }
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
                      '📸 *Deleted Image*',
                  }
                );
              } catch {}
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
                      '🎬 *Deleted Video*',
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
    isConnecting =
      false;

    if (
      activeConn &&
      activeConn !==
        null
    ) {
      return;
    }

    _origLog(
      chalk.red(
        '[CONNECT ERROR]'
      ),
      err?.stack ||
        err?.message ||
        err
    );

    scheduleReconnect(
      'connection error'
    );
  } finally {
    isConnecting =
      false;
  }
}

// ══════════════════════════════════════════════════════════════
// KEEP ALIVE
// ══════════════════════════════════════════════════════════════

app.get(
  '/',
  (req, res) =>
    res.json({
      status: 'online',
      bot:
        config.BOT_NAME,
      owner:
        config.OWNER_NAME,
      uptime:
        Math.floor(
          process.uptime()
        ) + 's',
      prefix:
        config.PREFIX,
      mode:
        config.MODE,
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
// ALWAYS ONLINE
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
// HEARTBEAT
// ══════════════════════════════════════════════════════════════

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
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════

async function shutdown(
  signal
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown =
    true;

  _origLog(
    chalk.yellow(
      `\n🛑 ${signal} received. Shutting down...`
    )
  );

  clearReconnectTimer();

  try {
    if (
      activeConn
    ) {
      try {
        activeConn.end(
          undefined
        );
      } catch {}
    }
  } catch {}

  try {
    if (
      mongoClient
    ) {
      await mongoClient.close();
    }
  } catch {}

  process.exit(0);
}

process.once(
  'SIGTERM',
  () =>
    shutdown('SIGTERM')
);

process.once(
  'SIGINT',
  () =>
    shutdown('SIGINT')
);

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

async function start() {
  try {
    await connectMongo();

    await ensureYtDlp();

    await connectToWhatsApp();
  } catch (err) {
    _origLog(
      chalk.yellow(
        `⚠️ Startup warning: ${err.message}`
      )
    );

    if (
      String(
        err?.message
      ).toLowerCase()
        .includes('ytdlp')
    ) {
      await connectToWhatsApp();
    } else {
      scheduleReconnect(
        'startup failure'
      );
    }
  }
}

start();
