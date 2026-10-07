// ============================================================
// CLOUD AI v3.2
// MongoDB Persistent Baileys Authentication
// Stable Single-Socket Connection Manager
// ============================================================

import 'dotenv/config'

import http from 'http'
import express from 'express'
import pino from 'pino'
import chalk from 'chalk'
import NodeCache from 'node-cache'
import moment from 'moment-timezone'
import { MongoClient } from 'mongodb'

import {
    makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser
} from '@whiskeysockets/baileys'

import { Boom } from '@hapi/boom'

import { Handler, Callupdate } from './data/handler.js'
import { lidMap } from './lib/Serializer.js'
import { ensureYtDlp } from './lib/ytdlp.js'
import config from './config.cjs'

// ============================================================
// PLUGINS
// ============================================================

import generalPlugin from './plugins/general.js'
import aiPlugin from './plugins/ai.js'
import imaginePlugin from './plugins/imagine.js'
import animePlugin from './plugins/anime.js'
import photoPlugin from './plugins/photo.js'
import downloaderPlugin from './plugins/downloader.js'
import converterPlugin from './plugins/converter.js'
import toolsPlugin from './plugins/tools.js'
import extraPlugin from './plugins/extra.js'
import groupPlugin from './plugins/group.js'
import ownerPlugin from './plugins/owner.js'
import searchPlugin from './plugins/search.js'
import gamesPlugin from './plugins/games.js'
import settingsPlugin from './plugins/settings.js'
import techPlugin from './plugins/tech.js'
import funPlugin from './plugins/fun.js'
import infoPlugin from './plugins/info.js'
import beraPlugin from './plugins/bera.js'
import btnmenuPlugin from './plugins/btnmenu.js'
import dbaPlugin from './plugins/dba.js'

import { onGroupUpdate } from './plugins/welcome.js'
import { handleCall } from './plugins/anticall.js'

// ============================================================
// PLUGINS ARRAY
// ============================================================

const ALL_PLUGINS = [
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
    beraPlugin,
    btnmenuPlugin,
    dbaPlugin
]

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 3000)

const MONGODB_URI = process.env.MONGODB_URI

const MONGODB_DB =
    process.env.MONGODB_DB ||
    'cloud_ai'

const MONGODB_COLLECTION =
    process.env.MONGODB_COLLECTION ||
    'baileys_auth'

const SESSION_ID =
    process.env.BAILEYS_SESSION_ID ||
    'cloud-ai-main'

const PAIRING_NUMBER =
    process.env.PAIRING_NUMBER ||
    config.owner?.replace(/[^0-9]/g, '') ||
    ''

if (!MONGODB_URI) {
    console.error(
        '[FATAL] MONGODB_URI is missing. Add it to your BeraHost environment variables.'
    )
    process.exit(1)
}

// ============================================================
// LOGGER
// ============================================================

const logger = pino({
    level: process.env.LOG_LEVEL || 'silent'
})

// ============================================================
// CACHE
// ============================================================

const msgRetryCounterCache = new NodeCache()

// ============================================================
// GLOBAL STATE
// ============================================================

let mongoClient = null
let mongoDb = null
let authCollection = null

let activeConn = null
let reconnectTimer = null
let pairingTimer = null

let reconnectAttempts = 0
let isConnecting = false
let shuttingDown = false

let socketGeneration = 0
let bannerShown = false

let bioLoopStarted = false
let reminderLoopStarted = false

let lastSuccessfulConnection = 0

global.conn = null
global._conn = null

// ============================================================
// LOGGER HELPERS
// ============================================================

const timeNow = () => {
    const n = new Date()

    const p = value =>
        String(value).padStart(2, '0')

    return `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`
}

const log = {
    info(message) {
        console.log(
            `${chalk.dim(timeNow())} ${chalk.green('●')} ${message}`
        )
    },

    success(message) {
        console.log(
            `${chalk.dim(timeNow())} ${chalk.greenBright('✓')} ${chalk.greenBright(message)}`
        )
    },

    warn(message) {
        console.log(
            `${chalk.dim(timeNow())} ${chalk.yellow('⚠')} ${chalk.yellow(message)}`
        )
    },

    error(message) {
        console.log(
            `${chalk.dim(timeNow())} ${chalk.red('✖')} ${chalk.red(message)}`
        )
    },

    system(message) {
        console.log(
            `${chalk.dim(timeNow())} ${chalk.cyan('◆')} ${chalk.cyan(message)}`
        )
    }
}

// ============================================================
// BANNER
// ============================================================

function printBanner() {
    if (bannerShown) return

    bannerShown = true

    console.log('')
    console.log(
        chalk.cyanBright(
            '╔══════════════════════════════════════════╗'
        )
    )
    console.log(
        chalk.cyanBright(
            '║              CLOUD AI v3.2               ║'
        )
    )
    console.log(
        chalk.cyanBright(
            '║          WhatsApp AI Agent               ║'
        )
    )
    console.log(
        chalk.cyanBright(
            '╚══════════════════════════════════════════╝'
        )
    )
    console.log('')
}

// ============================================================
// MONGODB SERIALIZATION
// ============================================================

function serializeValue(value) {
    return JSON.parse(
        JSON.stringify(value, (_, current) => {
            if (Buffer.isBuffer(current)) {
                return {
                    type: 'Buffer',
                    data: current.toString('base64')
                }
            }

            if (current instanceof Uint8Array) {
                return {
                    type: 'Buffer',
                    data: Buffer.from(current).toString('base64')
                }
            }

            return current
        })
    )
}

function deserializeValue(value) {
    return JSON.parse(
        JSON.stringify(value),
        (_, current) => {
            if (
                current &&
                current.type === 'Buffer' &&
                typeof current.data === 'string'
            ) {
                return Buffer.from(current.data, 'base64')
            }

            return current
        }
    )
}

// ============================================================
// MONGODB CONNECTION
// ============================================================

async function connectMongo() {
    if (mongoClient && mongoDb) {
        return
    }

    log.system('Connecting to MongoDB...')

    mongoClient = new MongoClient(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 45000
    })

    await mongoClient.connect()

    mongoDb = mongoClient.db(MONGODB_DB)
    authCollection = mongoDb.collection(MONGODB_COLLECTION)

    await authCollection.createIndex(
        {
            sessionId: 1,
            type: 1,
            key: 1
        },
        {
            unique: true
        }
    )

    log.success(`MongoDB connected: ${MONGODB_DB}`)
}

// ============================================================
// MONGODB BAILEYS AUTH STATE
// ============================================================

async function useMongoAuthState(sessionId) {

    if (!authCollection) {
        throw new Error('MongoDB authentication collection is not initialized')
    }

    const credsDocument =
        await authCollection.findOne({
            sessionId,
            type: 'creds',
            key: 'creds'
        })

    let creds

    if (credsDocument?.data) {
        creds = deserializeValue(credsDocument.data)
        log.success('Existing Baileys credentials loaded from MongoDB.')
    } else {
        const {
            initAuthCreds
        } = await import('@whiskeysockets/baileys')

        creds = initAuthCreds()

        log.warn('No existing Baileys credentials found.')
    }

    const keys = {

        async get(type, ids) {

            const documents =
                await authCollection.find({
                    sessionId,
                    type: `key:${type}`,
                    key: {
                        $in: ids
                    }
                }).toArray()

            const result = {}

            for (const id of ids) {

                const document =
                    documents.find(item => item.key === id)

                if (document?.data !== undefined) {
                    result[id] =
                        deserializeValue(document.data)
                }
            }

            return result
        },

        async set(data) {

            const operations = []

            for (const [type, entries] of Object.entries(data)) {

                for (const [id, value] of Object.entries(entries)) {

                    const keyType = `key:${type}`

                    if (value === null || value === undefined) {

                        operations.push({
                            deleteOne: {
                                filter: {
                                    sessionId,
                                    type: keyType,
                                    key: id
                                }
                            }
                        })

                    } else {

                        operations.push({
                            updateOne: {
                                filter: {
                                    sessionId,
                                    type: keyType,
                                    key: id
                                },

                                update: {
                                    $set: {
                                        sessionId,
                                        type: keyType,
                                        key: id,
                                        data: serializeValue(value),
                                        updatedAt: new Date()
                                    }
                                },

                                upsert: true
                            }
                        })
                    }
                }
            }

            if (operations.length) {
                await authCollection.bulkWrite(
                    operations,
                    {
                        ordered: false
                    }
                )
            }
        }
    }

    async function saveCreds() {

        await authCollection.updateOne(

            {
                sessionId,
                type: 'creds',
                key: 'creds'
            },

            {
                $set: {
                    sessionId,
                    type: 'creds',
                    key: 'creds',
                    data: serializeValue(creds),
                    updatedAt: new Date()
                }
            },

            {
                upsert: true
            }
        )
    }

    return {
        state: {
            creds,
            keys
        },

        saveCreds
    }
}

// ============================================================
// CLEAR MONGODB SESSION
// ============================================================

async function clearMongoSession() {

    if (!authCollection) return

    await authCollection.deleteMany({
        sessionId: SESSION_ID
    })

    log.warn('Baileys authentication removed from MongoDB.')
}

// ============================================================
// RECONNECT TIMER
// ============================================================

function clearReconnectTimer() {

    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
}

function clearPairingTimer() {

    if (pairingTimer) {
        clearTimeout(pairingTimer)
        pairingTimer = null
    }
}

// ============================================================
// SOCKET CHECK
// ============================================================

function isCurrentSocket(conn, generation) {

    return (
        !shuttingDown &&
        activeConn === conn &&
        socketGeneration === generation
    )
}

// ============================================================
// CLOSE ACTIVE SOCKET
// ============================================================

async function closeActiveConn() {

    const conn = activeConn

    if (!conn) return

    activeConn = null

    clearPairingTimer()

    try {
        conn.ev.removeAllListeners()
    } catch {}

    try {
        conn.ws?.close?.()
    } catch {}

    try {
        conn.ws?.terminate?.()
    } catch {}

    try {
        conn.end?.()
    } catch {}

    global.conn = null
    global._conn = null

    // Important:
    // Give Baileys/Signal time to flush before creating another socket.
    await new Promise(resolve =>
        setTimeout(resolve, 800)
    )
}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect(reason = 'connection closed', delay = null) {

    if (shuttingDown) return

    if (reconnectTimer) {
        return
    }

    reconnectAttempts++

    const calculatedDelay =
        delay ??
        Math.min(
            5000 * Math.pow(1.5, reconnectAttempts - 1),
            30000
        )

    log.warn(
        `${reason}. Reconnecting in ${Math.round(calculatedDelay / 1000)}s...`
    )

    reconnectTimer = setTimeout(
        async () => {

            reconnectTimer = null

            if (shuttingDown) return

            await closeActiveConn()

            try {
                await connectToWhatsApp()
            } catch (error) {

                log.error(
                    `Reconnect failed: ${error.message}`
                )

                scheduleReconnect(
                    'Reconnect attempt failed'
                )
            }

        },
        calculatedDelay
    )
}

// ============================================================
// PAIRING NUMBER
// ============================================================

function getPairingNumber() {

    const number =
        String(PAIRING_NUMBER || '')
            .replace(/[^0-9]/g, '')

    if (!number || number.length < 7) {
        return null
    }

    return number
}

// ============================================================
// PAIRING CODE REQUEST
// ============================================================

function schedulePairingCode(
    conn,
    state,
    generation
) {

    if (!isCurrentSocket(conn, generation)) {
        return
    }

    if (state.creds.registered) {
        return
    }

    const phoneNumber = getPairingNumber()

    if (!phoneNumber) {

        log.error(
            'No valid PAIRING_NUMBER/owner number configured.'
        )

        return
    }

    clearPairingTimer()

    // IMPORTANT:
    // Do NOT request the pairing code immediately after
    // makeWASocket(). Give the WebSocket time to initialize.
    pairingTimer = setTimeout(
        async () => {

            pairingTimer = null

            if (!isCurrentSocket(conn, generation)) {
                return
            }

            if (state.creds.registered) {
                return
            }

            try {

                log.system(
                    `Requesting WhatsApp pairing code for ${phoneNumber}`
                )

                const code =
                    await conn.requestPairingCode(
                        phoneNumber
                    )

                if (!isCurrentSocket(conn, generation)) {
                    return
                }

                const formatted =
                    code
                        ?.match(/.{1,4}/g)
                        ?.join('-') ||
                    code

                log.success(
                    `PAIRING CODE: ${formatted}`
                )

                console.log('')
                console.log(
                    chalk.green(
                        '╔══════════════════════════════════════════╗'
                    )
                )
                console.log(
                    chalk.green(
                        `║  PAIRING CODE: ${String(formatted).padEnd(26)}║`
                    )
                )
                console.log(
                    chalk.green(
                        '╠══════════════════════════════════════════╣'
                    )
                )
                console.log(
                    chalk.white(
                        '║ WhatsApp → Settings → Linked Devices     ║'
                    )
                )
                console.log(
                    chalk.white(
                        '║ → Link a Device → Link with phone       ║'
                    )
                )
                console.log(
                    chalk.white(
                        '║ number instead → enter the code          ║'
                    )
                )
                console.log(
                    chalk.green(
                        '╚══════════════════════════════════════════╝'
                    )
                )
                console.log('')

            } catch (error) {

                if (!isCurrentSocket(conn, generation)) {
                    return
                }

                log.warn(
                    `Pairing code request failed: ${error.message}`
                )

                // VERY IMPORTANT:
                // Do not delete MongoDB authentication here.
                // The connection may simply not be ready yet.
            }

        },

        3000
    )
}

// ============================================================
// CONNECTION
// ============================================================

async function connectToWhatsApp() {

    if (shuttingDown) return

    if (isConnecting) {
        return
    }

    if (activeConn) {
        return
    }

    isConnecting = true

    clearReconnectTimer()
    clearPairingTimer()

    try {

        const {
            state,
            saveCreds
        } = await useMongoAuthState(
            SESSION_ID
        )

        const {
            version
        } = await fetchLatestBaileysVersion()

        log.system(
            `WhatsApp Web version: ${version.join('.')}`
        )

        const generation =
            ++socketGeneration

        // Capture this BEFORE the socket starts.
        //
        // This allows us to distinguish:
        //
        // 401 during initial pairing
        //
        // from
        //
        // 401 after an already authenticated session.
        const wasRegisteredAtSocketStart =
            Boolean(state.creds.registered)

        const conn = makeWASocket({

            version,

            logger,

            auth: {
                creds: state.creds,

                keys:
                    makeCacheableSignalKeyStore(
                        state.keys,
                        logger
                    )
            },

            msgRetryCounterCache,

            printQRInTerminal: false,

            browser: [
                'Ubuntu',
                'Chrome',
                '22.0.0'
            ],

            markOnlineOnConnect: true,

            syncFullHistory: false,

            generateHighQualityLinkPreview: false,

            keepAliveIntervalMs:
                20000,

            connectTimeoutMs:
                90000,

            defaultQueryTimeoutMs:
                30000,

            retryRequestDelayMs:
                250,

            maxMsgRetryCount:
                3
        })

        activeConn = conn

        global.conn = conn
        global._conn = conn

        log.system(
            `Socket created [generation ${generation}]`
        )

        // ====================================================
        // CREDENTIAL PERSISTENCE
        // ====================================================

        conn.ev.on(
            'creds.update',
            async () => {

                try {
                    await saveCreds()
                } catch (error) {

                    log.error(
                        `Failed to persist Baileys credentials: ${error.message}`
                    )
                }
            }
        )

        // ====================================================
        // CONNECTION UPDATE
        // ====================================================

        conn.ev.on(
            'connection.update',
            async update => {

                if (
                    activeConn !== conn ||
                    socketGeneration !== generation
                ) {
                    return
                }

                const {
                    connection,
                    lastDisconnect
                } = update

                // --------------------------------------------
                // CONNECTING
                // --------------------------------------------

                if (
                    connection === 'connecting'
                ) {

                    log.system(
                        `Connecting to WhatsApp [generation ${generation}]...`
                    )

                    if (!state.creds.registered) {

                        schedulePairingCode(
                            conn,
                            state,
                            generation
                        )
                    }
                }

                // --------------------------------------------
                // OPEN
                // --------------------------------------------

                if (
                    connection === 'open'
                ) {

                    if (!isCurrentSocket(conn, generation)) {
                        return
                    }

                    clearPairingTimer()
                    clearReconnectTimer()

                    reconnectAttempts = 0
                    lastSuccessfulConnection =
                        Date.now()

                    isConnecting = false

                    log.success(
                        `WhatsApp connected as ${conn.user?.name || 'CLOUD AI'}`
                    )

                    const botJid =
                        jidNormalizedUser(
                            conn.user?.id || ''
                        )

                    log.system(
                        `Bot JID: ${botJid}`
                    )

                    global.conn = conn
                    global._conn = conn

                    // Resolve LID if supported
                    try {

                        if (
                            conn.user?.lid &&
                            conn.user?.id
                        ) {

                            lidMap.set(
                                conn.user.lid,
                                conn.user.id
                            )
                        }

                    } catch {}

                    // Start loops only once
                    startReminderLoop(conn)
                    startBioLoop(conn)

                    // ----------------------------------------
                    // OWNER ONLINE MESSAGE
                    // ----------------------------------------

                    try {

                        const ownerNumber =
                            String(
                                config.owner || ''
                            ).replace(
                                /[^0-9]/g,
                                ''
                            )

                        if (ownerNumber) {

                            const ownerJid =
                                `${ownerNumber}@s.whatsapp.net`

                            const prefix =
                                global.db?.data?.settings?.prefix ||
                                config.prefix ||
                                '.'

                            const now =
                                moment().format(
                                    'YYYY-MM-DD HH:mm:ss'
                                )

                            await conn.sendMessage(
                                ownerJid,
                                {
                                    text: [
                                        '━━━━━━━━━━━━━━━━━━━━━',
                                        '🤖 *CLOUD AI — ONLINE*',
                                        '━━━━━━━━━━━━━━━━━━━━━',
                                        '',
                                        '✅ Successfully connected to WhatsApp.',
                                        '',
                                        `🕐 *Time:* ${now}`,
                                        `⚡ *Prefix:* ${prefix}`,
                                        `🔖 *Version:* 3.2.0`,
                                        '',
                                        `💬 Chat with me: *${prefix}bera hello*`,
                                        `📋 Commands: *${prefix}menu*`,
                                        '',
                                        '━━━━━━━━━━━━━━━━━━━━━',
                                        '_CLOUD AI is ready._',
                                        '━━━━━━━━━━━━━━━━━━━━━'
                                    ].join('\n')
                                }
                            )
                        }

                    } catch (error) {

                        log.warn(
                            `Could not send online message: ${error.message}`
                        )
                    }
                }

                // --------------------------------------------
                // CLOSE
                // --------------------------------------------

                if (
                    connection === 'close'
                ) {

                    clearPairingTimer()

                    if (
                        activeConn !== conn ||
                        socketGeneration !== generation
                    ) {
                        return
                    }

                    activeConn = null

                    if (global.conn === conn) {
                        global.conn = null
                    }

                    if (global._conn === conn) {
                        global._conn = null
                    }

                    isConnecting = false

                    const error =
                        lastDisconnect?.error

                    const statusCode =
                        error instanceof Boom
                            ? error.output?.statusCode
                            : error?.output?.statusCode ||
                              error?.statusCode ||
                              null

                    log.warn(
                        `WhatsApp connection closed. Code: ${statusCode ?? 'unknown'}`
                    )

                    // ========================================
                    // 401 / LOGGED OUT
                    // ========================================

                    if (
                        statusCode ===
                        DisconnectReason.loggedOut ||
                        statusCode === 401
                    ) {

                        // ------------------------------------
                        // CRITICAL FIX
                        //
                        // If the socket was never registered
                        // and pairing itself failed, DO NOT
                        // delete MongoDB auth.
                        // ------------------------------------

                        const currentlyRegistered =
                            Boolean(
                                state.creds.registered
                            )

                        if (
                            !wasRegisteredAtSocketStart &&
                            !currentlyRegistered
                        ) {

                            log.warn(
                                '401 occurred during initial pairing. Keeping MongoDB authentication.'
                            )

                            log.system(
                                'Retrying pairing without deleting stored credentials...'
                            )

                            scheduleReconnect(
                                'Initial pairing connection closed',
                                5000
                            )

                            return
                        }

                        // ------------------------------------
                        // Genuine logout of an authenticated
                        // WhatsApp session.
                        // ------------------------------------

                        log.error(
                            'WhatsApp session was genuinely logged out.'
                        )

                        try {
                            await clearMongoSession()
                        } catch (error) {

                            log.error(
                                `Could not clear MongoDB auth: ${error.message}`
                            )
                        }

                        reconnectAttempts = 0

                        scheduleReconnect(
                            'Starting fresh WhatsApp authentication',
                            3000
                        )

                        return
                    }

                    // ========================================
                    // 440 — CONNECTION REPLACED
                    // ========================================

                    if (
                        statusCode ===
                        DisconnectReason.connectionReplaced ||
                        statusCode === 440
                    ) {

                        log.error(
                            'Connection replaced (440). Automatic reconnect stopped to prevent dual-socket conflicts.'
                        )

                        log.warn(
                            'Only one WhatsApp socket should use this session.'
                        )

                        return
                    }

                    // ========================================
                    // 408 — TIMEOUT
                    // ========================================

                    if (
                        statusCode ===
                        DisconnectReason.timedOut ||
                        statusCode === 408
                    ) {

                        log.warn(
                            state.creds.registered
                                ? 'WhatsApp connection timed out. Authentication will NOT be deleted.'
                                : 'Pairing connection timed out. Authentication will NOT be deleted.'
                        )

                        scheduleReconnect(
                            '408 connection timeout',
                            6000
                        )

                        return
                    }

                    // ========================================
                    // 515 — RESTART REQUIRED
                    // ========================================

                    if (
                        statusCode === 515 ||
                        statusCode ===
                        DisconnectReason.restartRequired
                    ) {

                        log.warn(
                            'WhatsApp requested a restart.'
                        )

                        scheduleReconnect(
                            'Restart required',
                            8000
                        )

                        return
                    }

                    // ========================================
                    // 503 — UNAVAILABLE
                    // ========================================

                    if (
                        statusCode === 503
                    ) {

                        log.warn(
                            'WhatsApp service temporarily unavailable.'
                        )

                        scheduleReconnect(
                            '503 service unavailable',
                            7000
                        )

                        return
                    }

                    // ========================================
                    // GENERIC DISCONNECT
                    // ========================================

                    scheduleReconnect(
                        `WhatsApp disconnected (${statusCode ?? 'unknown'})`,
                        6000
                    )
                }
            }
        )

        // ====================================================
        // OUTGOING MESSAGE LOGGER
        // ====================================================

        const originalSendMessage =
            conn.sendMessage.bind(conn)

        conn.sendMessage =
            async (jid, content, options) => {

                try {

                    if (
                        content &&
                        !content.react &&
                        !content.delete
                    ) {

                        let preview =
                            '[message]'

                        if (content.text) {
                            preview =
                                content.text
                                    .slice(0, 90)
                                    .replace(/\n/g, ' ')
                        } else if (content.image) {
                            preview = '📷 [image]'
                        } else if (content.video) {
                            preview = '🎬 [video]'
                        } else if (content.audio) {
                            preview = '🎵 [audio]'
                        } else if (content.sticker) {
                            preview = '🎴 [sticker]'
                        } else if (content.document) {
                            preview = '📄 [document]'
                        }

                        log.info(
                            `SENT → ${jid}: ${preview}`
                        )
                    }

                } catch {}

                return originalSendMessage(
                    jid,
                    content,
                    options
                )
            }

        // ====================================================
        // MESSAGES
        // ====================================================

        conn.ev.on(
            'messages.upsert',
            async ({ messages, type }) => {

                if (
                    activeConn !== conn ||
                    socketGeneration !== generation
                ) {
                    return
                }

                if (
                    type !== 'notify' &&
                    type !== 'append'
                ) {
                    return
                }

                for (const msg of messages) {

                    if (!msg?.message) {
                        continue
                    }

                    try {

                        const remoteJid =
                            msg.key?.remoteJid

                        // ------------------------------------
                        // STATUS
                        // ------------------------------------

                        if (
                            remoteJid ===
                            'status@broadcast'
                        ) {

                            try {

                                if (
                                    global.db?.data
                                        ?.settings
                                        ?.autoStatusView
                                ) {

                                    await conn.readMessages([
                                        msg.key
                                    ])
                                }

                            } catch {}

                            continue
                        }

                        // ------------------------------------
                        // LID MAPPING
                        // ------------------------------------

                        try {

                            const participant =
                                msg.key?.participant

                            if (
                                participant &&
                                participant.endsWith('@lid')
                            ) {

                                const contact =
                                    msg.pushName ||
                                    participant

                                if (
                                    msg.key.remoteJid &&
                                    msg.key.remoteJid.endsWith(
                                        '@s.whatsapp.net'
                                    )
                                ) {

                                    lidMap.set(
                                        participant,
                                        msg.key.remoteJid
                                    )
                                }

                                void contact
                            }

                        } catch {}

                        // ------------------------------------
                        // AUTO READ
                        // ------------------------------------

                        try {

                            if (
                                !msg.key?.fromMe &&
                                global.db?.data
                                    ?.settings
                                    ?.autoRead
                            ) {

                                await conn.readMessages([
                                    msg.key
                                ])
                            }

                        } catch {}

                        // ------------------------------------
                        // MESSAGE HANDLER
                        // ------------------------------------

                        try {

                            await Handler(
                                conn,
                                msg,
                                ALL_PLUGINS
                            )

                        } catch (error) {

                            console.error(
                                '[MESSAGE HANDLER]',
                                error.message
                            )
                        }

                    } catch (error) {

                        console.error(
                            '[MESSAGE]',
                            error.message
                        )
                    }
                }
            }
        )

        // ====================================================
        // GROUP EVENTS
        // ====================================================

        conn.ev.on(
            'group-participants.update',
            async update => {

                if (
                    activeConn !== conn ||
                    socketGeneration !== generation
                ) {
                    return
                }

                try {

                    await onGroupUpdate(
                        conn,
                        update
                    )

                } catch (error) {

                    console.error(
                        '[GROUP]',
                        error.message
                    )
                }
            }
        )

        // ====================================================
        // CALL EVENTS
        // ====================================================

        conn.ev.on(
            'call',
            async callEvents => {

                if (
                    activeConn !== conn ||
                    socketGeneration !== generation
                ) {
                    return
                }

                try {

                    if (
                        typeof handleCall ===
                        'function'
                    ) {

                        await handleCall(
                            conn,
                            callEvents
                        )

                    } else if (
                        typeof Callupdate ===
                        'function'
                    ) {

                        await Callupdate(
                            conn,
                            callEvents
                        )
                    }

                } catch (error) {

                    console.error(
                        '[CALL]',
                        error.message
                    )
                }
            }
        )

        // ====================================================
        // CONTACTS / CHATS
        // ====================================================

        conn.ev.on(
            'contacts.upsert',
            contacts => {

                try {

                    for (
                        const contact
                        of contacts
                    ) {

                        if (
                            contact.id &&
                            contact.id.endsWith('@lid') &&
                            contact.notify
                        ) {

                            lidMap.set(
                                contact.id,
                                contact.notify
                            )
                        }
                    }

                } catch {}
            }
        )

        conn.ev.on(
            'contacts.update',
            contacts => {

                try {

                    for (
                        const contact
                        of contacts
                    ) {

                        if (
                            contact.id &&
                            contact.id.endsWith('@lid') &&
                            contact.notify
                        ) {

                            lidMap.set(
                                contact.id,
                                contact.notify
                            )
                        }
                    }

                } catch {}
            }
        )

    } catch (error) {

        isConnecting = false

        if (
            activeConn
        ) {
            await closeActiveConn()
        }

        log.error(
            `Socket creation failed: ${error.message}`
        )

        scheduleReconnect(
            'Socket creation failure',
            7000
        )
    }
}

// ============================================================
// AUTO BIO
// ============================================================

function resolveBioVars(template) {

    const now = new Date()

    const pad = n =>
        String(n).padStart(2, '0')

    const time =
        `${pad(now.getHours())}:${pad(now.getMinutes())}`

    const days = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
    ]

    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
    ]

    const date =
        `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`

    const users =
        Object.keys(
            global.db?.data?.users || {}
        ).filter(
            jid =>
                !jid.includes('@newsletter')
        ).length

    const commands =
        global.db?.data?.stats
            ?.totalCommands || 0

    return String(template)
        .replace(
            /\{time\}/gi,
            time
        )
        .replace(
            /\{date\}/gi,
            date
        )
        .replace(
            /\{users\}/gi,
            users
        )
        .replace(
            /\{commands\}/gi,
            commands
        )
        .replace(
            /\{botname\}/gi,
            config.botName || 'CLOUD AI'
        )
}

// ============================================================
// BIO LOOP
// ============================================================

function startBioLoop(conn) {

    if (bioLoopStarted) {
        return
    }

    bioLoopStarted = true

    log.info(
        'Auto-bio loop started.'
    )

    const applyBio = async () => {

        try {

            if (
                activeConn !== conn
            ) {
                return
            }

            const settings =
                global.db?.data?.settings

            if (!settings?.autobio) {
                return
            }

            const bios =
                settings.bios || []

            if (!bios.length) {
                return
            }

            const index =
                (settings.currentBioIndex || 0) %
                bios.length

            const bio =
                resolveBioVars(
                    bios[index]
                )

            await conn.updateProfileStatus(
                bio
            )

            settings.currentBioIndex =
                (index + 1) %
                bios.length

            if (
                typeof global.db?.write ===
                'function'
            ) {
                await global.db.write()
            }

        } catch {}
    }

    applyBio()

    setInterval(
        applyBio,
        60 * 60 * 1000
    )
}

// ============================================================
// REMINDER LOOP
// ============================================================

function startReminderLoop(conn) {

    if (reminderLoopStarted) {
        return
    }

    reminderLoopStarted = true

    log.info(
        'Reminder loop started.'
    )

    setInterval(
        async () => {

            try {

                if (
                    activeConn !== conn
                ) {
                    return
                }

                const reminders =
                    global.db?.data
                        ?.reminders

                if (
                    !Array.isArray(reminders) ||
                    !reminders.length
                ) {
                    return
                }

                const now =
                    Date.now()

                const due =
                    reminders.filter(
                        reminder =>
                            reminder.fireAt <= now
                    )

                if (!due.length) {
                    return
                }

                global.db.data.reminders =
                    reminders.filter(
                        reminder =>
                            reminder.fireAt > now
                    )

                if (
                    typeof global.db?.write ===
                    'function'
                ) {
                    await global.db.write()
                }

                for (
                    const reminder
                    of due
                ) {

                    try {

                        await conn.sendMessage(
                            reminder.chat,
                            {
                                text:
                                    `⏰ *Reminder!*\n\n_${reminder.msg}_`
                            }
                        )

                    } catch (error) {

                        console.error(
                            '[REMINDER]',
                            error.message
                        )
                    }
                }

            } catch {}
        },

        30000
    )
}

// ============================================================
// ERROR PROTECTION
// ============================================================

process.on(
    'uncaughtException',
    error => {

        const message =
            error?.message || ''

        log.error(
            `Uncaught exception: ${message}`
        )

        if (
            message.includes(
                'Unsupported state'
            ) ||
            message.includes(
                'authenticate data'
            ) ||
            message.includes(
                'aesDecryptGCM'
            )
        ) {

            log.warn(
                'Crypto/socket error detected. Scheduling clean reconnect.'
            )

            scheduleReconnect(
                'Crypto error',
                6000
            )

            return
        }

        scheduleReconnect(
            'Unhandled runtime error',
            8000
        )
    }
)

process.on(
    'unhandledRejection',
    reason => {

        const message =
            reason?.message ||
            String(reason)

        log.error(
            `Unhandled rejection: ${message.slice(0, 300)}`
        )

        if (
            message.includes(
                'Unsupported state'
            ) ||
            message.includes(
                'authenticate data'
            ) ||
            message.includes(
                'aesDecryptGCM'
            )
        ) {

            scheduleReconnect(
                'Crypto rejection',
                6000
            )
        }
    }
)

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

let shuttingDownStarted = false

async function shutdown(signal) {

    if (shuttingDownStarted) {
        return
    }

    shuttingDownStarted = true
    shuttingDown = true

    log.warn(
        `${signal} received. Shutting down...`
    )

    clearReconnectTimer()
    clearPairingTimer()

    try {
        await closeActiveConn()
    } catch {}

    try {
        if (mongoClient) {
            await mongoClient.close()
        }
    } catch {}

    process.exit(0)
}

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
)

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
)

// ============================================================
// HTTP HEALTH SERVER
// ============================================================

const app = express()

app.get(
    '/',
    (_, res) => {

        res.status(200).json({
            status: 'online',
            bot: config.botName || 'CLOUD AI',
            whatsapp:
                activeConn
                    ? 'connected'
                    : 'disconnected',
            mongodb:
                mongoDb
                    ? 'connected'
                    : 'disconnected',
            uptime:
                process.uptime(),
            reconnectAttempts
        })
    }
)

app.get(
    '/health',
    (_, res) => {

        res.status(
            activeConn ? 200 : 503
        ).json({

            status:
                activeConn
                    ? 'healthy'
                    : 'disconnected',

            whatsapp:
                Boolean(activeConn),

            mongodb:
                Boolean(mongoDb),

            uptime:
                process.uptime()
        })
    }
)

const server =
    http.createServer(app)

server.listen(
    PORT,
    '0.0.0.0',
    () => {

        log.success(
            `Keep-alive server listening on port ${PORT}`
        )
    }
)

// ============================================================
// STARTUP
// ============================================================

async function start() {

    printBanner()

    try {

        // --------------------------------------------
        // MongoDB MUST be ready before WhatsApp.
        // --------------------------------------------

        await connectMongo()

        // --------------------------------------------
        // Initialize existing application DB.
        // --------------------------------------------

        // Your existing application database initialization
        // should remain here if it is part of your project.
        //
        // Example:
        //
        // await initDb()
        //
        // It is intentionally guarded because your current
        // CLOUD AI project already owns this layer.

        try {

            if (
                typeof global.initDb ===
                'function'
            ) {
                await global.initDb()
            }

        } catch (error) {

            log.warn(
                `Application DB initialization skipped: ${error.message}`
            )
        }

        // --------------------------------------------
        // yt-dlp
        // --------------------------------------------

        try {

            await ensureYtDlp()

        } catch (error) {

            log.warn(
                `yt-dlp initialization failed: ${error.message}`
            )
        }

        // --------------------------------------------
        // WhatsApp
        // --------------------------------------------

        await connectToWhatsApp()

    } catch (error) {

        log.error(
            `Startup failed: ${error.message}`
        )

        scheduleReconnect(
            'Startup failure',
            10000
        )
    }
}

// ============================================================
// START
// ============================================================

start()

// ============================================================
// HEARTBEAT
// ============================================================

setInterval(
    () => {

        const uptime =
            Math.floor(
                process.uptime()
            )

        const hours =
            Math.floor(
                uptime / 3600
            )

        const minutes =
            Math.floor(
                (uptime % 3600) / 60
            )

        const seconds =
            uptime % 60

        if (
            activeConn
        ) {

            console.log(
                chalk.dim(
                    `[HEARTBEAT] ${hours}h${minutes}m${seconds}s | 🟢 connected | MongoDB: ${mongoDb ? 'ready' : 'offline'}`
                )
            )

        } else {

            console.log(
                chalk.dim(
                    `[HEARTBEAT] ${hours}h${minutes}m${seconds}s | 🔴 disconnected | reconnects: ${reconnectAttempts}`
                )
            )
        }

    },

    5 * 60 * 1000
)
