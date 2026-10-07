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

// ─────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────

const app = express();

const PORT =
  parseInt(process.env.PORT, 10) || 3000;

const lime =
  chalk.bold.hex('#32CD32');

const orange =
  chalk.bold.hex('#FFA500');

let initialConnection = true;

let reconnectAttempts = 0;

let isConnecting = false;

let activeConn = null;

let shuttingDown = false;

let reconnectTimer = null;

let pairingTimer = null;

let socketGeneration = 0;

const msgRetryCounterCache =
  new NodeCache();

const messageStore =
  new Map();


// ─────────────────────────────────────────────────────────────
// MONGODB CONFIGURATION
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT:
// Put your NEW/ROTATED MongoDB password in this URI.
// Do not reuse the password previously exposed in chat.

const MONGODB_URI =
  'mongodb+srv://ellyongiro8:REPLACE_WITH_YOUR_ROTATED_PASSWORD@cluster0.tyxcmm9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const MONGODB_DB =
  'cloud_ai';

const MONGODB_COLLECTION =
  'baileys_auth';

const MONGODB_SESSIONS_COLLECTION =
  'baileys_sessions';

// Legacy ID used by your previous implementation.
// It is only used for migration of an existing registered
// session. New sessions NEVER use this ID.
const LEGACY_SESSION_ID =
  'cloud-ai-main';

let mongoClient = null;

let mongoDb = null;

let mongoCollection = null;

let mongoSessionsCollection = null;

let mongoConnecting = null;

// The session currently owned by the active socket.
let currentSessionId = null;

let currentSessionStatus = null;


// ─────────────────────────────────────────────────────────────
// PAIRING PHONE FILE
// ─────────────────────────────────────────────────────────────

const __dirname =
  path.dirname(
    new URL(import.meta.url).pathname
  );

const sessionDir =
  path.join(
    __dirname,
    'session'
  );

const phoneFile =
  path.join(
    sessionDir,
    '.phone'
  );

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(
    sessionDir,
    {
      recursive: true
    }
  );
}


// ─────────────────────────────────────────────────────────────
// SUPPRESS BAILEYS CRYPTO NOISE
// ─────────────────────────────────────────────────────────────

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
          .map(a => {
            if (
              typeof a === 'string'
            ) {
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

            return String(
              a ?? ''
            );
          })
          .join(' ');

      if (
        SUPPRESS.some(
          p => p.test(str)
        )
      ) {
        return;
      }
    } catch {
      // pass through
    }

    fn(...args);
  };
}

console.log =
  suppress(_origLog);

console.error =
  suppress(_origErr);

console.warn =
  suppress(_origWarn);


// ─────────────────────────────────────────────────────────────
// CONTACTS STORE
// ─────────────────────────────────────────────────────────────

const store = {
  contacts: {}
};


// ─────────────────────────────────────────────────────────────
// GLOBAL CRASH GUARD
// ─────────────────────────────────────────────────────────────

process.on(
  'uncaughtException',
  err => {
    _origLog(
      chalk.red(
        `⚠️ Uncaught Exception (handled): ${err.message}`
      )
    );

    // NEVER clear MongoDB auth here.
  }
);

process.on(
  'unhandledRejection',
  reason => {
    const msg =
      reason?.message ||
      String(reason);

    _origLog(
      chalk.red(
        `⚠️ Unhandled Rejection (handled): ${msg}`
      )
    );

    // NEVER clear MongoDB auth here.
  }
);


// ─────────────────────────────────────────────────────────────
// BANNER
// ─────────────────────────────────────────────────────────────

_origLog(
  orange(`
╔══════════════════════════════════╗
║         ℂ𝕃𝕆𝕌𝔻 𝔸𝕀  v3.2          ║
║     by 𝔹ℝ𝕌ℂ𝔼 𝔹𝔼ℝ𝔸              ║
╚══════════════════════════════════╝
`)
);


// ══════════════════════════════════════════════════════════════
// MONGODB VALUE SERIALIZATION
// ══════════════════════════════════════════════════════════════

function serializeMongoValue(value) {
  if (
    Buffer.isBuffer(value)
  ) {
    return {
      __type: 'Buffer',
      data:
        value.toString('base64')
    };
  }

  if (
    value instanceof Uint8Array
  ) {
    return {
      __type: 'Buffer',
      data:
        Buffer
          .from(value)
          .toString('base64')
    };
  }

  if (Array.isArray(value)) {
    return value.map(
      serializeMongoValue
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const output = {};

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      output[key] =
        serializeMongoValue(val);
    }

    return output;
  }

  return value;
}


function deserializeMongoValue(value) {
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

  if (Array.isArray(value)) {
    return value.map(
      deserializeMongoValue
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const output = {};

    for (
      const [key, val]
      of Object.entries(value)
    ) {
      output[key] =
        deserializeMongoValue(val);
    }

    return output;
  }

  return value;
}


// ══════════════════════════════════════════════════════════════
// CONNECT MONGODB
// ══════════════════════════════════════════════════════════════

async function connectMongo() {
  if (
    mongoDb &&
    mongoCollection &&
    mongoSessionsCollection
  ) {
    return mongoDb;
  }

  if (mongoConnecting) {
    return mongoConnecting;
  }

  mongoConnecting =
    (async () => {

      _origLog(
        chalk.cyan(
          '🔌 Connecting to MongoDB...'
        )
      );

      mongoClient =
        new MongoClient(
          MONGODB_URI,
          {
            serverSelectionTimeoutMS:
              30000,

            connectTimeoutMS:
              30000,

            socketTimeoutMS:
              30000,

            maxPoolSize:
              10,

            retryWrites:
              true,
          }
        );

      await mongoClient.connect();

      mongoDb =
        mongoClient.db(
          MONGODB_DB
        );

      mongoCollection =
        mongoDb.collection(
          MONGODB_COLLECTION
        );

      mongoSessionsCollection =
        mongoDb.collection(
          MONGODB_SESSIONS_COLLECTION
        );

      await mongoCollection.createIndex(
        {
          sessionId: 1,
          type: 1,
          key: 1,
        },
        {
          unique: true,
        }
      );

      await mongoSessionsCollection.createIndex(
        {
          sessionId: 1,
        },
        {
          unique: true,
        }
      );

      await mongoSessionsCollection.createIndex(
        {
          status: 1,
          registered: 1,
          updatedAt: -1,
        }
      );

      _origLog(
        lime(
          '✅ MongoDB connected'
        )
      );

      _origLog(
        chalk.gray(
          `📦 Database: ${MONGODB_DB}`
        )
      );

      _origLog(
        chalk.gray(
          `📁 Auth collection: ${MONGODB_COLLECTION}`
        )
      );

      _origLog(
        chalk.gray(
          `📁 Session registry: ${MONGODB_SESSIONS_COLLECTION}`
        )
      );

      return mongoDb;
    })();

  try {
    return await mongoConnecting;
  } finally {
    mongoConnecting =
      null;
  }
}


// ══════════════════════════════════════════════════════════════
// SESSION REGISTRY
// ══════════════════════════════════════════════════════════════

function generateSessionId() {
  const timestamp =
    Date.now().toString(36);

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  return `cloud-ai-${timestamp}-${random}`;
}


async function createNewSession() {
  await connectMongo();

  const sessionId =
    generateSessionId();

  const now =
    new Date();

  await mongoSessionsCollection.insertOne({
    sessionId,

    status:
      'pending',

    registered:
      false,

    createdAt:
      now,

    updatedAt:
      now,

    lastReason:
      'new pairing session',
  });

  currentSessionId =
    sessionId;

  currentSessionStatus =
    'pending';

  _origLog(
    chalk.cyan(
      `🆕 Created new WhatsApp session: ${sessionId}`
    )
  );

  return sessionId;
}


async function updateSessionRegistry(
  sessionId,
  updates = {}
) {
  if (!sessionId) {
    return;
  }

  await connectMongo();

  await mongoSessionsCollection.updateOne(
    {
      sessionId,
    },
    {
      $set: {
        ...updates,
        updatedAt:
          new Date(),
      },
      $setOnInsert: {
        sessionId,
        createdAt:
          new Date(),
      },
    },
    {
      upsert: true,
    }
  );

  if (
    sessionId === currentSessionId &&
    updates.status
  ) {
    currentSessionStatus =
      updates.status;
  }
}


async function markSessionPending(
  sessionId,
  reason = 'waiting for pairing'
) {
  await updateSessionRegistry(
    sessionId,
    {
      status:
        'pending',

      registered:
        false,

      lastReason:
        reason,
    }
  );
}


async function markSessionActive(
  sessionId,
  phone = null
) {
  await updateSessionRegistry(
    sessionId,
    {
      status:
        'active',

      registered:
        true,

      phone:
        phone || undefined,

      lastReason:
        'WhatsApp connected',
    }
  );
}


async function markSessionFailed(
  sessionId,
  reason
) {
  await updateSessionRegistry(
    sessionId,
    {
      status:
        'failed',

      registered:
        false,

      lastReason:
        reason || 'pairing session failed',
    }
  );
}


async function markSessionLoggedOut(
  sessionId
) {
  await updateSessionRegistry(
    sessionId,
    {
      status:
        'logged_out',

      registered:
        false,

      lastReason:
        'WhatsApp logged out',
    }
  );
}


async function findRegisteredSession() {
  await connectMongo();

  const sessions =
    await mongoSessionsCollection
      .find({
        status:
          'active',

        registered:
          true,
      })
      .sort({
        updatedAt:
          -1,
      })
      .limit(10)
      .toArray();

  for (
    const session of sessions
  ) {

    const credsDocument =
      await mongoCollection.findOne({
        sessionId:
          session.sessionId,

        type:
          'creds',
      });

    if (
      !credsDocument?.data
    ) {
      await markSessionFailed(
        session.sessionId,
        'active registry entry has no credentials'
      );

      continue;
    }

    try {

      const creds =
        deserializeMongoValue(
          credsDocument.data
        );

      if (
        creds?.registered
      ) {

        _origLog(
          lime(
            `♻️ Restoring active WhatsApp session: ${session.sessionId}`
          )
        );

        return session.sessionId;
      }

      await markSessionFailed(
        session.sessionId,
        'credentials are not registered'
      );

    } catch (err) {

      await markSessionFailed(
        session.sessionId,
        `invalid stored credentials: ${err.message}`
      );
    }
  }

  return null;
}


// ─────────────────────────────────────────────────────────────
// LEGACY SESSION MIGRATION
// ─────────────────────────────────────────────────────────────

async function migrateLegacySessionIfNeeded() {
  await connectMongo();

  const existingLegacy =
    await mongoCollection.findOne({
      sessionId:
        LEGACY_SESSION_ID,

      type:
        'creds',
    });

  if (
    !existingLegacy?.data
  ) {
    return null;
  }

  try {

    const creds =
      deserializeMongoValue(
        existingLegacy.data
      );

    if (
      !creds?.registered
    ) {

      _origLog(
        chalk.yellow(
          '⚠️ Legacy cloud-ai-main exists but is not registered. It will not be reused.'
        )
      );

      return null;
    }

    const alreadyMigrated =
      await mongoSessionsCollection.findOne({
        sessionId:
          LEGACY_SESSION_ID,
      });

    if (
      alreadyMigrated
    ) {

      if (
        alreadyMigrated.status ===
          'active' &&
        alreadyMigrated.registered
      ) {
        return LEGACY_SESSION_ID;
      }

      return null;
    }

    await mongoSessionsCollection.insertOne({
      sessionId:
        LEGACY_SESSION_ID,

      status:
        'active',

      registered:
        true,

      phone:
        creds.me?.id ||
        null,

      createdAt:
        new Date(),

      updatedAt:
        new Date(),

      lastReason:
        'migrated from previous CLOUD AI session architecture',
    });

    _origLog(
      chalk.cyan(
        '♻️ Migrated existing registered cloud-ai-main session.'
      )
    );

    return LEGACY_SESSION_ID;

  } catch (err) {

    _origLog(
      chalk.red(
        `❌ Legacy session migration failed: ${err.message}`
      )
    );

    return null;
  }
}


async function getSessionForStartup() {
  await connectMongo();

  // First use an already registered active session.
  let sessionId =
    await findRegisteredSession();

  if (sessionId) {
    currentSessionId =
      sessionId;

    currentSessionStatus =
      'active';

    return sessionId;
  }

  // Then attempt one-time migration of the old fixed session.
  sessionId =
    await migrateLegacySessionIfNeeded();

  if (sessionId) {
    currentSessionId =
      sessionId;

    currentSessionStatus =
      'active';

    return sessionId;
  }

  // Retire any abandoned pending sessions.
  await mongoSessionsCollection.updateMany(
    {
      status:
        'pending',
    },
    {
      $set: {
        status:
          'failed',

        registered:
          false,

        lastReason:
          'abandoned pending session replaced by new startup session',

        updatedAt:
          new Date(),
      },
    }
  );

  return await createNewSession();
}


// ══════════════════════════════════════════════════════════════
// MONGODB BAILEYS AUTH STATE
// ══════════════════════════════════════════════════════════════

async function useMongoAuthState(
  sessionId
) {
  await connectMongo();

  const credsDocument =
    await mongoCollection.findOne(
      {
        sessionId,
        type: 'creds',
      }
    );

  let creds;

  if (
    credsDocument &&
    credsDocument.data
  ) {

    creds =
      deserializeMongoValue(
        credsDocument.data
      );

  } else {

    creds =
      initAuthCreds();

    _origLog(
      chalk.yellow(
        `🆕 No existing WhatsApp credentials found for session ${sessionId}.`
      )
    );
  }


  const keys = {

    async get(
      type,
      ids
    ) {
      const result = {};

      if (
        !ids ||
        !ids.length
      ) {
        return result;
      }

      const documents =
        await mongoCollection
          .find({
            sessionId,
            type:
              `key:${type}`,
            key: {
              $in: ids,
            },
          })
          .toArray();

      for (
        const id of ids
      ) {

        const document =
          documents.find(
            item =>
              item.key === id
          );

        if (
          document &&
          document.data !== undefined
        ) {

          result[id] =
            deserializeMongoValue(
              document.data
            );
        }
      }

      return result;
    },


    async set(data) {
      const operations = [];

      for (
        const [
          type,
          values
        ]
        of Object.entries(data)
      ) {

        for (
          const [
            id,
            value
          ]
          of Object.entries(
            values || {}
          )
        ) {

          const documentType =
            `key:${type}`;

          if (
            value === null ||
            value === undefined
          ) {

            operations.push({
              deleteOne: {
                filter: {
                  sessionId,
                  type:
                    documentType,
                  key:
                    id,
                },
              },
            });

          } else {

            operations.push({
              updateOne: {
                filter: {
                  sessionId,
                  type:
                    documentType,
                  key:
                    id,
                },

                update: {
                  $set: {
                    sessionId,

                    type:
                      documentType,

                    key:
                      id,

                    data:
                      serializeMongoValue(
                        value
                      ),

                    updatedAt:
                      new Date(),
                  },
                },

                upsert:
                  true,
              },
            });
          }
        }
      }

      if (
        operations.length
      ) {

        await mongoCollection.bulkWrite(
          operations,
          {
            ordered:
              false,
          }
        );
      }
    },
  };


  async function saveCreds() {

    await mongoCollection.updateOne(
      {
        sessionId,

        type:
          'creds',
      },

      {
        $set: {
          sessionId,

          type:
            'creds',

          data:
            serializeMongoValue(
              creds
            ),

          updatedAt:
            new Date(),
        },
      },

      {
        upsert:
          true,
      }
    );


    // Once Baileys reports registration,
    // immediately promote this session.
    if (
      creds.registered &&
      currentSessionId === sessionId
    ) {

      await markSessionActive(
        sessionId,
        creds.me?.id ||
          null
      );
    }
  }


  return {
    state: {
      creds,

      keys:
        makeCacheableSignalKeyStore(
          keys,
          pino({
            level:
              'warn'
          })
        ),
    },

    saveCreds,
  };
}


// ══════════════════════════════════════════════════════════════
// CLEAR MONGODB SESSION
// ══════════════════════════════════════════════════════════════

async function clearMongoSession(
  sessionId
) {
  try {

    await connectMongo();

    if (!sessionId) {
      return;
    }

    await mongoCollection.deleteMany(
      {
        sessionId,
      }
    );

    _origLog(
      chalk.yellow(
        `🗑️ MongoDB WhatsApp authentication cleared for session: ${sessionId}`
      )
    );

  } catch (err) {

    _origLog(
      chalk.red(
        `❌ Failed to clear MongoDB session: ${err.message}`
      )
    );
  }
}


// ══════════════════════════════════════════════════════════════
// PAIRING-CODE AUTHENTICATION
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


function savePairingNumber(
  number
) {
  try {

    const normalized =
      normalizePhoneNumber(
        number
      );

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


function loadPairingNumber() {
  try {

    if (
      !fs.existsSync(
        phoneFile
      )
    ) {
      return null;
    }

    const number =
      fs.readFileSync(
        phoneFile,
        'utf8'
      ).trim();

    return normalizePhoneNumber(
      number
    );

  } catch {
    return null;
  }
}


function deletePairingNumber() {
  try {

    if (
      fs.existsSync(
        phoneFile
      )
    ) {
      fs.unlinkSync(
        phoneFile
      );
    }

  } catch {}
}


async function askForPhoneNumber() {
  return new Promise(
    resolve => {

      const rl =
        readline.createInterface({
          input:
            process.stdin,

          output:
            process.stdout,
        });

      rl.question(
        chalk.cyan(
          '\n📱 Enter WhatsApp number with country code (example: 2547XXXXXXXX): '
        ),

        answer => {

          rl.close();

          const number =
            normalizePhoneNumber(
              answer
            );

          if (!number) {
            resolve(null);
            return;
          }

          savePairingNumber(
            number
          );

          resolve(number);
        }
      );
    }
  );
}


async function getPairingNumber() {

  // 1. Previously saved number.
  let number =
    loadPairingNumber();

  if (number) {
    return number;
  }

  // 2. PAIRING_NUMBER.
  if (
    process.env.PAIRING_NUMBER
  ) {

    number =
      normalizePhoneNumber(
        process.env.PAIRING_NUMBER
      );

    if (number) {

      savePairingNumber(
        number
      );

      return number;
    }
  }

  // 3. OWNER_NUMBER.
  if (
    config?.OWNER_NUMBER
  ) {

    number =
      normalizePhoneNumber(
        config.OWNER_NUMBER
      );

    if (number) {

      savePairingNumber(
        number
      );

      return number;
    }
  }

  // 4. Terminal.
  return await askForPhoneNumber();
}


function showPairingCode(
  code
) {
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


// ══════════════════════════════════════════════════════════════
// RECONNECT CONTROL
// ══════════════════════════════════════════════════════════════

function scheduleReconnect(
  reason,
  delay = null
) {
  if (shuttingDown) {
    return;
  }

  if (reconnectTimer) {
    return;
  }

  reconnectAttempts++;

  const reconnectDelay =
    delay ??
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
      `🔄 ${reason} — reconnect attempt ${reconnectAttempts} in ${Math.round(reconnectDelay / 1000)}s...`
    )
  );

  reconnectTimer =
    setTimeout(
      async () => {

        reconnectTimer =
          null;

        if (shuttingDown) {
          return;
        }

        try {

          await connectToWhatsApp();

        } catch (err) {

          _origLog(
            chalk.red(
              `[RECONNECT ERROR] ${err.message}`
            )
          );

          scheduleReconnect(
            'Reconnect failed'
          );
        }
      },

      reconnectDelay
    );
}


// ─────────────────────────────────────────────────────────────
// START A BRAND-NEW PAIRING SESSION
// ─────────────────────────────────────────────────────────────

async function startNewPairingSession(
  reason
) {
  if (shuttingDown) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }

  const oldSession =
    currentSessionId;

  if (
    oldSession
  ) {

    await markSessionFailed(
      oldSession,
      reason
    );
  }

  currentSessionId =
    null;

  currentSessionStatus =
    null;

  reconnectAttempts =
    0;

  pairingTimer =
    null;

  _origLog(
    chalk.cyan(
      `🆕 ${reason}`
    )
  );

  scheduleReconnect(
    'creating new pairing session',
    2000
  );
}


// ─────────────────────────────────────────────────────────────
// SOCKET CLOSE
// ─────────────────────────────────────────────────────────────

async function closeSocket(
  conn
) {
  if (!conn) {
    return;
  }

  try {
    conn.ev.removeAllListeners();
  } catch {}

  try {

    if (conn.ws) {
      conn.ws.close();
    }

  } catch {}

  try {

    if (
      typeof conn.end ===
      'function'
    ) {

      conn.end(
        undefined
      );
    }

  } catch {}

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        800
      )
  );
}


// ══════════════════════════════════════════════════════════════
// CONNECT
// ══════════════════════════════════════════════════════════════

async function connectToWhatsApp() {

  if (shuttingDown) {
    return;
  }

  if (isConnecting) {
    return;
  }

  if (activeConn) {
    return;
  }

  isConnecting =
    true;

  const generation =
    ++socketGeneration;

  let pairingRequested =
    false;

  let sessionId =
    currentSessionId;

  let state = null;

  let saveCreds = null;

  let wasRegisteredAtStart =
    false;

  let pairingNumber =
    null;

  try {

    // ────────────────────────────────────────────────────────
    // SELECT SESSION
    // ────────────────────────────────────────────────────────

    if (!sessionId) {

      sessionId =
        await getSessionForStartup();

    }

    currentSessionId =
      sessionId;


    _origLog(
      chalk.gray(
        `🔑 Current MongoDB session: ${sessionId}`
      )
    );


    // ────────────────────────────────────────────────────────
    // MongoDB AUTH
    // ────────────────────────────────────────────────────────

    ({
      state,
      saveCreds
    } =
      await useMongoAuthState(
        sessionId
      ));


    wasRegisteredAtStart =
      Boolean(
        state.creds.registered
      );


    if (
      wasRegisteredAtStart
    ) {

      await markSessionActive(
        sessionId,
        state.creds.me?.id ||
          null
      );

      currentSessionStatus =
        'active';

    } else {

      await markSessionPending(
        sessionId,
        'waiting for WhatsApp pairing'
      );

      currentSessionStatus =
        'pending';
    }


    // ────────────────────────────────────────────────────────
    // BAILLEYS VERSION
    // ────────────────────────────────────────────────────────

    const {
      version
    } =
      await fetchLatestBaileysVersion();

    _origLog(
      chalk.gray(
        `📦 Baileys version: ${version.join('.')}`
      )
    );


    // ────────────────────────────────────────────────────────
    // PAIRING NUMBER
    // ────────────────────────────────────────────────────────

    if (
      !state.creds.registered
    ) {

      pairingNumber =
        await getPairingNumber();

      if (!pairingNumber) {

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


    // ────────────────────────────────────────────────────────
    // CREATE SOCKET
    // ────────────────────────────────────────────────────────

    const conn =
      makeWASocket({
        version,

        logger:
          pino({
            level:
              'warn'
          }),

        printQRInTerminal:
          false,

        browser:
          Browsers.ubuntu(
            'Chrome'
          ),

        auth:
          state,

        msgRetryCounterCache,

        generateHighQualityLinkPreview:
          true,

        syncFullHistory:
          false,

        connectTimeoutMs:
          90000,

        defaultQueryTimeoutMs:
          60000,

        keepAliveIntervalMs:
          20000,

        markOnlineOnConnect:
          true,

        getMessage:
          async key => {

            const stored =
              messageStore.get(
                `${key.remoteJid}:${key.id}`
              );

            return stored ||
              undefined;
          },
      });


    activeConn =
      conn;

    isConnecting =
      false;


    // ══════════════════════════════════════════════════════════
    // CONTACTS
    // ══════════════════════════════════════════════════════════

    conn.ev.on(
      'contacts.upsert',
      contacts => {

        for (
          const c of contacts
        ) {

          if (c.id) {

            store.contacts[
              c.id
            ] = c;
          }
        }
      }
    );


    conn.ev.on(
      'contacts.update',
      updates => {

        for (
          const u of updates
        ) {

          if (u.id) {

            store.contacts[
              u.id
            ] = {
              ...(
                store.contacts[
                  u.id
                ] || {}
              ),

              ...u,
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
      async update => {

        if (
          activeConn !== conn ||
          generation !==
            socketGeneration ||
          shuttingDown
        ) {
          return;
        }

        const {
          connection,
          lastDisconnect
        } = update;


        // ─────────────────────────────────────────────────────
        // CONNECTING
        // ─────────────────────────────────────────────────────

        if (
          connection ===
          'connecting'
        ) {

          _origLog(
            chalk.yellow(
              '⏳ Connecting to WhatsApp...'
            )
          );


          /*
           * Pairing code is requested only for
           * an unregistered CURRENT socket.
           */

          if (
            !state.creds.registered &&
            pairingNumber &&
            !pairingRequested
          ) {

            clearTimeout(
              pairingTimer
            );

            pairingTimer =
              setTimeout(
                async () => {

                  if (
                    activeConn !==
                      conn ||
                    generation !==
                      socketGeneration ||
                    shuttingDown
                  ) {
                    return;
                  }

                  if (
                    state.creds.registered
                  ) {
                    return;
                  }

                  if (
                    pairingRequested
                  ) {
                    return;
                  }

                  pairingRequested =
                    true;

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

                    showPairingCode(
                      code
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

                },
                3000
              );
          }
        }


        // ─────────────────────────────────────────────────────
        // CONNECTION OPEN
        // ─────────────────────────────────────────────────────

        if (
          connection ===
          'open'
        ) {

          clearTimeout(
            pairingTimer
          );

          pairingTimer =
            null;

          pairingRequested =
            false;

          reconnectAttempts =
            0;

          initialConnection =
            false;

          deletePairingNumber();


          // Make absolutely sure the current session
          // is marked active only after WhatsApp opens.
          await markSessionActive(
            sessionId,
            conn.user?.id ||
              null
          );


          _origLog(
            lime(
              `\n✅ ${config.BOT_NAME} Connected!`
            )
          );


          _origLog(
            lime(
              `🔑 MongoDB session: ${sessionId}`
            )
          );


          const botNum =
            conn.user?.id
              ?.split(':')[0];


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


          // ────────────────────────────────────────────────
          // SELF MESSAGE
          // ────────────────────────────────────────────────

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

          } catch (err) {

            _origLog(
              chalk.yellow(
                `⚠️ Self-message failed: ${err.message}`
              )
            );
          }


          // ────────────────────────────────────────────────
          // RESOLVE OWNER LID
          // ────────────────────────────────────────────────

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


        // ─────────────────────────────────────────────────────
        // CONNECTION CLOSED
        // ─────────────────────────────────────────────────────

        if (
          connection ===
          'close'
        ) {

          clearTimeout(
            pairingTimer
          );

          pairingTimer =
            null;


          if (
            activeConn === conn
          ) {

            activeConn =
              null;
          }


          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;


          _origLog(
            chalk.red(
              `❌ WhatsApp connection closed. Code: ${code ?? 'unknown'}`
            )
          );


          if (
            shuttingDown
          ) {
            return;
          }


          // ═══════════════════════════════════════════════════
          // 401
          // ═══════════════════════════════════════════════════
          //
          // UNREGISTERED:
          // The pairing attempt failed/died.
          // DO NOT reuse the same auth session.
          //
          // REGISTERED:
          // Genuine WhatsApp logout.
          // Retire this session and create another.
          // ═══════════════════════════════════════════════════

          if (
            code ===
              DisconnectReason.loggedOut ||
            code ===
              401
          ) {

            if (
              wasRegisteredAtStart ||
              state.creds.registered
            ) {

              _origLog(
                chalk.yellow(
                  '🔐 Registered WhatsApp session logged out.'
                )
              );

              await markSessionLoggedOut(
                sessionId
              );

              await clearMongoSession(
                sessionId
              );

              reconnectAttempts =
                0;

              pairingRequested =
                false;

              currentSessionId =
                null;

              currentSessionStatus =
                null;


              // Do NOT reconnect this same session.
              // A completely new MongoDB session is created.
              scheduleReconnect(
                'logged out — creating new session',
                3000
              );

            } else {

              _origLog(
                chalk.yellow(
                  '⚠️ Unregistered pairing session failed.'
                )
              );

              await markSessionFailed(
                sessionId,
                '401 during unregistered pairing'
              );

              pairingRequested =
                false;


              /*
               * CRITICAL:
               *
               * The old session is now retired.
               * We do NOT call scheduleReconnect()
               * while currentSessionId still points to it.
               */

              currentSessionId =
                null;

              currentSessionStatus =
                null;

              reconnectAttempts =
                0;


              _origLog(
                chalk.cyan(
                  '🆕 Retired failed pairing session. Creating a brand-new session...'
                )
              );


              scheduleReconnect(
                'new pairing session',
                2000
              );
            }

            return;
          }


          // ═══════════════════════════════════════════════════
          // 440 CONNECTION REPLACED
          // ═══════════════════════════════════════════════════

          if (
            code ===
            440
          ) {

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

            scheduleReconnect(
              'stream conflict 440',
              wait440
            );

            return;
          }


          // ═══════════════════════════════════════════════════
          // TEMPORARY DISCONNECT
          // ═══════════════════════════════════════════════════

          if (
            code === 408 ||
            code === 503 ||
            code === 515
          ) {

            /*
             * IMPORTANT:
             *
             * Temporary disconnects MUST reuse
             * the same session.
             */

            scheduleReconnect(
              `temporary disconnect ${code}`
            );

            return;
          }


          // ═══════════════════════════════════════════════════
          // GENERAL DISCONNECT
          // ═══════════════════════════════════════════════════

          scheduleReconnect(
            `disconnect ${code ?? 'unknown'}`
          );
        }
      }
    );


    // ══════════════════════════════════════════════════════════
    // SAVE MONGODB CREDENTIALS
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
      items => {

        for (
          const c of (
            Array.isArray(items)
              ? items
              : Object.values(
                  items
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
            !id.endsWith(
              '@lid'
            )
          ) {

            lidMap.set(
              lid,
              id
            );
          }


          if (
            c.id &&
            !c.id.endsWith(
              '@lid'
            ) &&
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

    conn.ev.process(
      async events => {
        // Keep event processor alive.
        // Actual handlers remain below.
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
          msg =>
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

            // ─────────────────────────────────────────────
            // RESOLVE @LID JIDS
            // ─────────────────────────────────────────────

            const tryResolveLid =
              lid => {

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


                if (!resolved) {

                  const match =
                    Object.values(
                      store?.contacts ||
                        {}
                    ).find(
                      c =>
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
              msg.key
                ?.remoteJid
                ?.endsWith('@lid')
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
              msg.key
                ?.participant
                ?.endsWith('@lid')
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


            // ─────────────────────────────────────────────
            // STATUS
            // ─────────────────────────────────────────────

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
                  .catch(
                    () => {}
                  );
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

                        key:
                          msg.key
                      }
                    },

                    {
                      statusJidList: [
                        msg.key
                          .participant
                      ]
                    }
                  )
                  .catch(
                    () => {}
                  );
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
                        config.STATUS_READ_MSG
                    }
                  )
                  .catch(
                    () => {}
                  );
              }


              continue;
            }


            // ─────────────────────────────────────────────
            // STORE MESSAGES
            // ─────────────────────────────────────────────

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
                    ts:
                      Date.now()
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


            // ─────────────────────────────────────────────
            // AUTO READ
            // ─────────────────────────────────────────────

            if (
              config.AUTO_READ
            ) {

              await conn
                .readMessages([
                  msg.key
                ])
                .catch(
                  () => {}
                );
            }


            // ─────────────────────────────────────────────
            // PROCESS MESSAGE
            // ─────────────────────────────────────────────

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
      async item => {

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
              msg
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


            // ───────────────────────────────────────────
            // ALERT
            // ───────────────────────────────────────────

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
                    deleter
                  ],
                }
              )
              .catch(
                () => {}
              );


            // ───────────────────────────────────────────
            // TEXT
            // ───────────────────────────────────────────

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
                  .catch(
                    () => {}
                  );
              }


            // ───────────────────────────────────────────
            // IMAGE
            // ───────────────────────────────────────────

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


                await conn
                  .sendMessage(
                    target,
                    {
                      image: buf,
                      caption:
                        '📸 *Deleted Image*'
                    }
                  );

              } catch {}


            // ───────────────────────────────────────────
            // VIDEO
            // ───────────────────────────────────────────

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


                await conn
                  .sendMessage(
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
      call =>
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
      async update => {

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
      generation ===
        socketGeneration
    ) {

      activeConn =
        null;
    }


    _origLog(
      chalk.red(
        '[CONNECT ERROR]'
      ),
      err?.message
    );


    /*
     * If startup failed before WhatsApp was registered,
     * retire the pending session rather than endlessly
     * reusing a broken authentication state.
     */

    if (
      sessionId &&
      !wasRegisteredAtStart
    ) {

      try {

        await markSessionFailed(
          sessionId,
          `connection startup failed: ${err.message}`
        );

      } catch {}
      
      if (
        currentSessionId ===
        sessionId
      ) {

        currentSessionId =
          null;

        currentSessionStatus =
          null;
      }
    }


    scheduleReconnect(
      'Connection startup failed'
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
      status:
        'online',

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

      mongodb:
        mongoDb
          ? 'connected'
          : 'disconnected',

      whatsapp:
        activeConn
          ? 'connected'
          : 'reconnecting',

      session:
        currentSessionId ||
        null,

      sessionStatus:
        currentSessionStatus ||
        null,

      time:
        moment()
          .tz(
            'Africa/Nairobi'
          )
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
        .catch(
          () => {}
        );
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
        `💓 ${h}h${m}m${s}s | ${st} | session:${currentSessionId || 'none'} | status:${currentSessionStatus || 'none'} | store:${messageStore.size}`
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
      `\n🛑 ${signal} received. Shutting down CLOUD AI...`
    )
  );


  clearTimeout(
    reconnectTimer
  );

  clearTimeout(
    pairingTimer
  );


  reconnectTimer =
    null;

  pairingTimer =
    null;


  try {

    if (activeConn) {

      const conn =
        activeConn;

      activeConn =
        null;

      await closeSocket(
        conn
      );
    }

  } catch {}


  try {

    if (mongoClient) {

      await mongoClient.close();

      mongoClient =
        null;

      mongoDb =
        null;

      mongoCollection =
        null;

      mongoSessionsCollection =
        null;

      _origLog(
        chalk.green(
          '✅ MongoDB connection closed.'
        )
      );
    }

  } catch {}


  process.exit(0);
}


process.on(
  'SIGINT',
  () =>
    shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () =>
    shutdown('SIGTERM')
);


// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

_origLog(
  chalk.cyan(
    `📦 MongoDB database : ${MONGODB_DB}`
  )
);

_origLog(
  chalk.cyan(
    `📁 MongoDB auth collection : ${MONGODB_COLLECTION}`
  )
);

_origLog(
  chalk.cyan(
    `📁 MongoDB session registry : ${MONGODB_SESSIONS_COLLECTION}`
  )
);

_origLog(
  chalk.cyan(
    '🔑 MongoDB session mode : UNIQUE PER PAIRING'
  )
);

_origLog(
  chalk.cyan(
    '💾 WhatsApp authentication: MongoDB'
  )
);

_origLog(
  chalk.cyan(
    '☁️ BeraHost local session dependency: disabled'
  )
);

_origLog('');


ensureYtDlp()
  .then(
    () =>
      connectToWhatsApp()
  )
  .catch(
    err => {

      _origLog(
        chalk.yellow(
          `⚠️ yt-dlp unavailable: ${err.message} — download commands may be limited`
        )
      );

      connectToWhatsApp();
    }
  );
